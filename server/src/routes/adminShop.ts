import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { logAdmin, notify, type Ctx } from '../domain.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { ah, idParam, parse } from '../lib/http.js';
import { processImage } from '../lib/images.js';
import { orderAdminSchema, productCreateSchema, productUpdateSchema } from '../lib/shopValidation.js';
import { nn } from '../lib/validation.js';
import { requireRole } from '../middleware.js';
import { uploadSingle } from './me.js';
import { orderView, productView, ORDER_LABELS } from './shop.js';

const ORDER_STATUSES = Object.keys(ORDER_LABELS);
const NEXT: Record<string, string[]> = {
  awaiting_payment: ['cancelled'],
  paid: ['preparing', 'delivered', 'cancelled'],
  preparing: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

/** Administration de la boutique : produits (prix de test) et suivi des commandes. */
export function adminShopRoutes(ctx: Ctx) {
  const { store } = ctx;
  const r = Router();
  r.use(requireRole('admin'));

  const allCats = () => store.select('service_categories', { order: { col: 'sort_order', asc: true } });

  async function checkCategory(id: string | null | undefined) {
    if (!id) return;
    const [c] = await store.select('service_categories', { eq: { id }, limit: 1 });
    if (!c) throw badRequest('Catégorie inconnue.');
  }

  r.get(
    '/products',
    ah(async (_req, res) => {
      const [cats, rows] = await Promise.all([allCats(), store.select('products', { order: { col: 'sort_order', asc: true } })]);
      res.json({
        categories: cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
        products: await Promise.all(rows.map((p) => productView(ctx, p, cats))),
      });
    }),
  );

  r.post(
    '/products',
    ah(async (req, res) => {
      const b = parse(productCreateSchema, req.body);
      await checkCategory(b.category_id);
      const [p] = await store.insert('products', {
        title: b.title,
        description: nn(b.description),
        category_id: b.category_id ?? null,
        price_pi: b.price_pi,
        image_path: b.image_path ?? null,
        is_active: b.is_active,
        sort_order: b.sort_order,
      });
      await logAdmin(store, req.user!.id, 'shop.product.create', 'product', p.id, { title: b.title });
      res.status(201).json({ product: await productView(ctx, p, await allCats()) });
    }),
  );

  r.put(
    '/products/:id',
    ah(async (req, res) => {
      const id = idParam(req);
      const b = parse(productUpdateSchema, req.body);
      await checkCategory(b.category_id);
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(b)) if (v !== undefined) patch[k] = k === 'description' ? nn(v as string | null) : v;
      if (!Object.keys(patch).length) throw badRequest('Aucune modification.');
      const [p] = await store.update('products', { eq: { id } }, patch);
      if (!p) throw notFound('Produit introuvable.');
      await logAdmin(store, req.user!.id, 'shop.product.update', 'product', id, { fields: Object.keys(patch) });
      res.json({ product: await productView(ctx, p, await allCats()) });
    }),
  );

  r.delete(
    '/products/:id',
    ah(async (req, res) => {
      const id = idParam(req);
      const [p] = await store.select('products', { eq: { id }, limit: 1 });
      if (!p) throw notFound('Produit introuvable.');
      await store.remove('products', { eq: { id } });
      if (p.image_path && !String(p.image_path).startsWith('/')) await store.removeFile('portfolio', p.image_path);
      await logAdmin(store, req.user!.id, 'shop.product.delete', 'product', id, { title: p.title });
      res.status(204).end();
    }),
  );

  r.post(
    '/products/:id/image',
    (req, res, next) =>
      uploadSingle(req, res, (err: unknown) => {
        if (!err) return next();
        const code = (err as { code?: string }).code;
        next(badRequest(code === 'LIMIT_FILE_SIZE' ? 'Image trop lourde (5 Mo maximum).' : 'Envoi invalide.'));
      }),
    ah(async (req, res) => {
      const id = idParam(req);
      const [p] = await store.select('products', { eq: { id }, limit: 1 });
      if (!p) throw notFound('Produit introuvable.');
      if (!req.file) throw badRequest('Aucun fichier reçu (champ « file »).');
      const img = await processImage(req.file.buffer);
      const path = `products/${randomUUID()}.${img.ext}`;
      await store.putFile('portfolio', path, img.data, img.contentType);
      const [u] = await store.update('products', { eq: { id } }, { image_path: path });
      if (p.image_path && !String(p.image_path).startsWith('/')) await store.removeFile('portfolio', p.image_path);
      await logAdmin(store, req.user!.id, 'shop.product.image', 'product', id);
      res.json({ product: await productView(ctx, u!, await allCats()) });
    }),
  );

  // ---------------------------------------------------------------- Commandes
  r.get(
    '/orders',
    ah(async (req, res) => {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      if (status && !ORDER_STATUSES.includes(status)) throw badRequest('Statut inconnu.');
      const rows = await store.select('orders', { ...(status ? { eq: { status } } : {}), order: { col: 'created_at', asc: false }, limit: 300 });
      const clients = rows.length ? await store.select('profiles', { in: { id: [...new Set(rows.map((o) => o.client_id))] } }) : [];
      const name = new Map(clients.map((c) => [c.id, (c.display_name as string) || (c.pi_username as string)]));
      res.json({
        orders: await Promise.all(rows.map(async (o) => ({ ...(await orderView(ctx, o)), client_name: name.get(o.client_id) ?? 'Utilisateur', pi_txid: (o.pi_txid as string | null) ?? null }))),
      });
    }),
  );

  r.get(
    '/summary',
    ah(async (_req, res) => {
      const rows = await store.select('orders', { limit: 5000 });
      const by: Record<string, number> = {};
      let paidTotal = 0;
      for (const o of rows) {
        by[o.status] = (by[o.status] ?? 0) + 1;
        if (['paid', 'preparing', 'delivered'].includes(o.status)) paidTotal += Number(o.total_pi);
      }
      res.json({ by_status: by, paid_total_pi: Math.round(paidTotal * 10000) / 10000, products: await store.count('products') });
    }),
  );

  r.patch(
    '/orders/:id',
    ah(async (req, res) => {
      const id = idParam(req);
      const b = parse(orderAdminSchema, req.body);
      const [o] = await store.select('orders', { eq: { id }, limit: 1 });
      if (!o) throw notFound('Commande introuvable.');
      if (!NEXT[o.status]?.includes(b.status)) throw conflict(`Passage impossible : ${ORDER_LABELS[o.status]} → ${ORDER_LABELS[b.status]}.`);
      const [u] = await store.update('orders', { eq: { id, status: o.status } }, { status: b.status, ...(b.admin_note !== undefined ? { admin_note: nn(b.admin_note) } : {}) });
      if (!u) throw conflict('La commande a changé entre-temps. Actualisez.');
      await logAdmin(store, req.user!.id, 'shop.order.status', 'order', id, { from: o.status, to: b.status });
      await notify(ctx.store, { user_id: o.client_id, type: 'system', title: `Commande : ${ORDER_LABELS[b.status].toLowerCase()}`, body: o.product_title });
      res.json({ order: await orderView(ctx, u) });
    }),
  );

  return r;
}
