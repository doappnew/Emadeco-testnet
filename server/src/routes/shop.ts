import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { notify, resolveImage, type Ctx } from '../domain.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { ah, idParam, parse } from '../lib/http.js';
import { amt, approvePayment, completePayment, getPayment, type PiPayment } from '../lib/piPayments.js';
import { nn } from '../lib/validation.js';
import { orderCreateSchema, paymentCompleteSchema, paymentIdSchema } from '../lib/shopValidation.js';
import { requireAuth } from '../middleware.js';
import type { Row } from '../store/types.js';

export const ORDER_LABELS: Record<string, string> = {
  awaiting_payment: 'En attente de paiement',
  paid: 'Payée',
  preparing: 'En préparation',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};
const PAID_STATES = ['paid', 'preparing', 'delivered'];
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export async function productView(ctx: Ctx, p: Row, cats: Row[]) {
  const c = cats.find((x) => x.id === p.category_id);
  return {
    id: p.id as string,
    title: p.title as string,
    description: (p.description as string | null) ?? null,
    price_pi: Number(p.price_pi),
    image_url: await resolveImage(ctx.store, p.image_path),
    image_path: (p.image_path as string | null) ?? null,
    category_id: (p.category_id as string | null) ?? null,
    category_name: (c?.name as string | undefined) ?? null,
    category_slug: (c?.slug as string | undefined) ?? null,
    is_active: p.is_active as boolean,
    sort_order: p.sort_order as number,
  };
}

export async function orderView(ctx: Ctx, o: Row) {
  return {
    id: o.id as string,
    status: o.status as string,
    status_label: ORDER_LABELS[o.status as string] ?? (o.status as string),
    product_id: (o.product_id as string | null) ?? null,
    product_title: o.product_title as string,
    product_image_url: await resolveImage(ctx.store, o.product_image),
    quantity: o.quantity as number,
    unit_price_pi: Number(o.unit_price_pi),
    total_pi: Number(o.total_pi),
    recipient_name: o.recipient_name as string,
    phone: o.phone as string,
    country: o.country as string,
    city: o.city as string,
    address: o.address as string,
    landmark: (o.landmark as string | null) ?? null,
    notes: (o.notes as string | null) ?? null,
    admin_note: (o.admin_note as string | null) ?? null,
    paid_at: (o.paid_at as string | null) ?? null,
    created_at: o.created_at as string,
  };
}

/** Boutique côté client : catalogue, commandes et paiement Pi. Le montant est TOUJOURS décidé par le serveur. */
export function shopRoutes(ctx: Ctx) {
  const { store, config } = ctx;
  const pi = { apiBase: config.pi.apiBase, apiKey: config.pi.apiKey, fetchImpl: ctx.fetchImpl };
  const r = Router();
  r.use(requireAuth);

  const orderLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { message: 'Trop de commandes. Réessayez plus tard.', code: 'rate_limited' } },
  });

  const activeCats = () => store.select('service_categories', { eq: { is_active: true }, order: { col: 'sort_order', asc: true } });

  // ---------------------------------------------------------------- Catalogue
  r.get(
    '/products',
    ah(async (_req, res) => {
      const [cats, products] = await Promise.all([
        activeCats(),
        store.select('products', { eq: { is_active: true }, order: { col: 'sort_order', asc: true } }),
      ]);
      const views = await Promise.all(products.map((p) => productView(ctx, p, cats)));
      const categories = cats
        .map((c) => ({ id: c.id as string, slug: c.slug as string, name: c.name as string, count: views.filter((v) => v.category_id === c.id).length }))
        .filter((c) => c.count > 0);
      res.json({ categories, products: views });
    }),
  );

  r.get(
    '/products/:id',
    ah(async (req, res) => {
      const [p] = await store.select('products', { eq: { id: idParam(req), is_active: true }, limit: 1 });
      if (!p) throw notFound('Produit introuvable.');
      res.json({ product: await productView(ctx, p, await activeCats()) });
    }),
  );

  // ---------------------------------------------------------------- Commandes
  r.post(
    '/orders',
    orderLimiter,
    ah(async (req, res) => {
      const body = parse(orderCreateSchema, req.body);
      const [p] = await store.select('products', { eq: { id: body.product_id, is_active: true }, limit: 1 });
      if (!p) throw notFound('Ce produit n’est plus disponible.');
      const open = await store.count('orders', { eq: { client_id: req.user!.id, status: 'awaiting_payment' } });
      if (open >= 10) throw conflict('Vous avez trop de commandes en attente de paiement. Réglez ou annulez-en.', 'too_many_open');
      const unit = Number(p.price_pi);
      const [order] = await store.insert('orders', {
        client_id: req.user!.id,
        product_id: p.id,
        product_title: p.title,
        product_image: p.image_path ?? null,
        quantity: body.quantity,
        unit_price_pi: unit,
        total_pi: round4(unit * body.quantity),
        recipient_name: body.delivery.recipient_name,
        phone: body.delivery.phone,
        country: body.delivery.country,
        city: body.delivery.city,
        address: body.delivery.address,
        landmark: nn(body.delivery.landmark),
        notes: nn(body.delivery.notes),
        status: 'awaiting_payment',
        pi_payment_id: null,
        pi_txid: null,
        paid_at: null,
        admin_note: null,
      });
      res.status(201).json({ order: await orderView(ctx, order) });
    }),
  );

  r.get(
    '/orders',
    ah(async (req, res) => {
      const rows = await store.select('orders', { eq: { client_id: req.user!.id }, order: { col: 'created_at', asc: false }, limit: 100 });
      res.json({ orders: await Promise.all(rows.map((o) => orderView(ctx, o))) });
    }),
  );

  const myOrder = async (req: Parameters<typeof idParam>[0]) => {
    const [o] = await store.select('orders', { eq: { id: idParam(req), client_id: req.user!.id }, limit: 1 });
    if (!o) throw notFound('Commande introuvable.');
    return o;
  };

  r.get(
    '/orders/:id',
    ah(async (req, res) => {
      res.json({ order: await orderView(ctx, await myOrder(req)) });
    }),
  );

  r.post(
    '/orders/:id/cancel',
    ah(async (req, res) => {
      const o = await myOrder(req);
      if (o.status !== 'awaiting_payment') throw conflict('Seule une commande en attente de paiement peut être annulée.');
      const [u] = await store.update('orders', { eq: { id: o.id, status: 'awaiting_payment' } }, { status: 'cancelled' });
      res.json({ order: await orderView(ctx, u ?? o) });
    }),
  );

  // ---------------------------------------------------------------- Paiement Pi
  /** Commande visée par un paiement : elle doit appartenir à l'utilisateur, au même montant, du même compte Pi. */
  async function orderForPayment(payment: PiPayment, user: Row): Promise<Row> {
    const orderId = payment.metadata?.order_id;
    if (typeof orderId !== 'string' || !/^[0-9a-f-]{36}$/i.test(orderId)) throw badRequest('Paiement sans commande associée.');
    const [order] = await store.select('orders', { eq: { id: orderId }, limit: 1 });
    if (!order || order.client_id !== user.id) throw forbidden('Ce paiement ne correspond à aucune de vos commandes.');
    if (payment.user_uid !== user.pi_uid) throw forbidden('Ce paiement appartient à un autre compte Pi.');
    if (amt(payment.amount) !== amt(order.total_pi)) throw conflict('Le montant du paiement ne correspond pas à la commande.', 'amount_mismatch');
    return order;
  }

  async function approveFlow(payment: PiPayment, user: Row) {
    const order = await orderForPayment(payment, user);
    if (order.status !== 'awaiting_payment') {
      if (order.pi_payment_id === payment.identifier && PAID_STATES.includes(order.status)) return order;
      throw conflict('Cette commande n’attend plus de paiement.', 'not_payable');
    }
    if (order.pi_payment_id !== payment.identifier) {
      await store.update('orders', { eq: { id: order.id, status: 'awaiting_payment' } }, { pi_payment_id: payment.identifier });
    }
    if (!payment.status?.developer_approved) await approvePayment(pi, payment.identifier);
    return order;
  }

  async function completeFlow(payment: PiPayment, user: Row, txid: string) {
    const [order] = await store.select('orders', { eq: { pi_payment_id: payment.identifier }, limit: 1 });
    if (!order || order.client_id !== user.id) throw notFound('Commande introuvable pour ce paiement.');
    if (PAID_STATES.includes(order.status)) return order; // idempotent : rappel en double du SDK Pi
    if (order.status !== 'awaiting_payment') throw conflict('Cette commande n’attend plus de paiement.', 'not_payable');
    if (payment.user_uid !== user.pi_uid) throw forbidden('Ce paiement appartient à un autre compte Pi.');
    if (amt(payment.amount) !== amt(order.total_pi)) throw conflict('Le montant du paiement ne correspond pas à la commande.', 'amount_mismatch');
    const chainTx = payment.transaction?.txid;
    if (chainTx && chainTx !== txid) throw badRequest('Identifiant de transaction incohérent.');
    if (!payment.status?.developer_completed) await completePayment(pi, payment.identifier, chainTx ?? txid);
    const [paid] = await store.update(
      'orders',
      { eq: { id: order.id, status: 'awaiting_payment' } },
      { status: 'paid', pi_txid: chainTx ?? txid, paid_at: new Date().toISOString() },
    );
    if (!paid) return (await store.select('orders', { eq: { id: order.id }, limit: 1 }))[0]!;
    await notify(store, { user_id: user.id as string, type: 'system', title: 'Paiement reçu', body: `Commande « ${paid.product_title} » payée. Nous la préparons.` });
    const admins = await store.select('profiles', { eq: { role: 'admin', status: 'active' } });
    await Promise.all(admins.map((a) => notify(store, { user_id: a.id, type: 'system', title: 'Nouvelle commande payée', body: `${paid.product_title} × ${paid.quantity} — ${paid.city}` })));
    return paid;
  }

  r.post(
    '/payments/approve',
    ah(async (req, res) => {
      const { paymentId } = parse(paymentIdSchema, req.body);
      const payment = await getPayment(pi, paymentId);
      await approveFlow(payment, req.user!);
      res.json({ ok: true });
    }),
  );

  r.post(
    '/payments/complete',
    ah(async (req, res) => {
      const { paymentId, txid } = parse(paymentCompleteSchema, req.body);
      const payment = await getPayment(pi, paymentId);
      const order = await completeFlow(payment, req.user!, txid);
      res.json({ ok: true, order: await orderView(ctx, order) });
    }),
  );

  /** Paiement resté en suspens (détecté par le SDK Pi à la connexion) : on le reprend ou on l'ignore. */
  r.post(
    '/payments/incomplete',
    ah(async (req, res) => {
      const { paymentId } = parse(paymentIdSchema, req.body);
      const payment = await getPayment(pi, paymentId);
      if (payment.status?.cancelled || payment.status?.user_cancelled) return res.json({ ok: true, state: 'cancelled' });
      await approveFlow(payment, req.user!);
      const txid = payment.transaction?.txid;
      if (txid) {
        const order = await completeFlow(payment, req.user!, txid);
        return res.json({ ok: true, state: 'completed', order: await orderView(ctx, order) });
      }
      res.json({ ok: true, state: 'approved' });
    }),
  );

  return r;
}
