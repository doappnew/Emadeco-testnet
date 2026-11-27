import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { logAdmin, notify, type Ctx } from '../domain.js';
import { conflict, forbidden, HttpError, notFound } from '../lib/errors.js';
import { ah } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { CLOSED_KEY, PAYOUT_MAX, canOffer, isClosed, payoutAvailable, payoutState, servedCount, PAYOUT_NOTICE } from '../lib/payout.js';
import { amt, cancelPayment, completePayment, createA2UPayment } from '../lib/piPayments.js';
import { TESTNET, submitStellarPayment } from '../lib/stellar.js';
import { requireAuth, requireRole } from '../middleware.js';
import { StoreError, type Row } from '../store/types.js';

const PAID_STATES = ['paid', 'preparing', 'delivered'];

/** Notification de première connexion : une seule fois par compte, seulement si le test est encore proposé. */
export async function maybeNotifyPayout(ctx: Ctx, profileId: string): Promise<void> {
  try {
    const st = await payoutState(ctx.config, ctx.store, profileId);
    if (!canOffer(st)) return;
    const prior = await ctx.store.count('notifications', { eq: { user_id: profileId, title: PAYOUT_NOTICE.title } });
    if (prior > 0) return;
    await notify(ctx.store, { user_id: profileId, type: 'system', ...PAYOUT_NOTICE });
  } catch (e) {
    logger.warn('payout: notification non créée', { reason: e instanceof Error ? e.name : 'inconnue' });
  }
}

class PayoutFailure extends Error {
  constructor(
    public step: string,
    public txSubmitted = false,
  ) {
    super(step);
  }
}

export function testnetPayoutRoutes(ctx: Ctx) {
  const { store, config } = ctx;
  const submit = ctx.stellarSubmit ?? submitStellarPayment;
  const r = Router();
  r.use(requireAuth);
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { message: 'Trop de tentatives. Réessayez plus tard.', code: 'rate_limited' } },
  });

  /** État pour l'écran Profil et l'accueil (aucun secret). */
  r.get(
    '/status',
    ah(async (req, res) => {
      const st = await payoutState(config, store, req.user!.id as string);
      const testnet = config.pi.network === 'testnet';
      const paidOrders = testnet ? await store.count('orders', { eq: { client_id: req.user!.id }, in: { status: PAID_STATES } }) : 0;
      res.json({
        available: st.available,
        closed: st.closed,
        served: st.served,
        max: st.max,
        offer: canOffer(st),
        received: st.mine?.status === 'completed',
        pending: st.mine?.status === 'pending',
        amount: config.testnetPayout.amount,
        // Test de paiement (U2A) : facultatif, sans limite de comptes — simple liste de contrôle.
        payment_check: { enabled: testnet, done: paidOrders > 0 },
      });
    }),
  );

  /** Envoi de test : un seul par compte, 5 comptes au plus, montant fixé par le serveur. */
  r.post(
    '/',
    limiter,
    ah(async (req, res) => {
      if (!payoutAvailable(config) || (await isClosed(store))) throw notFound('Indisponible');
      const user = req.user!;
      const profileId = user.id as string;
      const amount = config.testnetPayout.amount;

      const [existing] = await store.select('testnet_payouts', { eq: { profile_id: profileId }, limit: 1 });
      if (existing && existing.status !== 'failed') throw conflict('Vous avez déjà reçu ou demandé votre envoi de test.', 'already_sent');
      if ((await servedCount(store)) >= PAYOUT_MAX) throw forbidden('Le nombre maximal de pionniers du test est atteint.');

      // Réservation AVANT toute création de paiement : la clé primaire profile_id interdit un double envoi.
      let claimed: Row | undefined;
      try {
        if (existing) [claimed] = await store.update('testnet_payouts', { eq: { profile_id: profileId, status: 'failed' } }, { status: 'pending', amount, payment_id: null, txid: null });
        else [claimed] = await store.insert('testnet_payouts', { profile_id: profileId, amount, status: 'pending' });
      } catch (e) {
        if (e instanceof StoreError && e.code === '23505') throw conflict('Vous avez déjà reçu ou demandé votre envoi de test.', 'already_sent');
        if (e instanceof StoreError && e.code === 'P0001') throw forbidden('Le nombre maximal de pionniers du test est atteint.');
        throw e;
      }
      if (!claimed) throw conflict('Vous avez déjà reçu ou demandé votre envoi de test.', 'already_sent');
      const mine = { eq: { profile_id: profileId } };
      if ((await servedCount(store)) > PAYOUT_MAX) {
        await store.update('testnet_payouts', mine, { status: 'failed' });
        throw forbidden('Le nombre maximal de pionniers du test est atteint.');
      }

      const pi = { apiBase: config.pi.apiBase, apiKey: config.pi.apiKey, fetchImpl: ctx.fetchImpl };
      let paymentId: string | undefined;
      let txid: string | undefined;
      try {
        let created;
        try {
          created = await createA2UPayment(pi, { amount, memo: 'Test de réception EMADECO (Testnet)', metadata: { kind: 'testnet_payout' }, uid: user.pi_uid as string });
        } catch {
          throw new PayoutFailure('create');
        }
        paymentId = created.identifier;
        await store.update('testnet_payouts', mine, { payment_id: paymentId });
        // Garde-fous : réseau de test uniquement, montant exact.
        if (created.network !== TESTNET.passphrase) throw new PayoutFailure('network');
        if (amt(created.amount) !== amt(amount)) throw new PayoutFailure('amount');
        if (!created.from_address || !created.to_address) throw new PayoutFailure('addresses');

        try {
          txid = await submit({
            seed: config.testnetPayout.walletSeed!,
            fromAddress: created.from_address,
            toAddress: created.to_address,
            amount: amount.toFixed(7),
            memo: created.identifier,
            networkPassphrase: TESTNET.passphrase,
            horizonUrl: TESTNET.horizonUrl,
          });
        } catch {
          throw new PayoutFailure('submit');
        }
        await store.update('testnet_payouts', mine, { txid });
        try {
          await completePayment(pi, paymentId, txid);
        } catch {
          throw new PayoutFailure('complete', true);
        }
        await store.update('testnet_payouts', mine, { status: 'completed' });
      } catch (e) {
        const step = e instanceof PayoutFailure ? e.step : 'inconnue';
        const sent = e instanceof PayoutFailure && e.txSubmitted;
        // Journal : étape seulement (jamais de clé, de seed ni de message brut).
        logger.error('payout: échec', { step, tx_submitted: sent });
        if (sent) {
          // La transaction est partie : on ne marque pas « failed » (pas de second envoi possible).
          throw new HttpError(502, 'L’envoi a été effectué mais sa confirmation est en cours. Vous ne pouvez pas le redemander.', 'payout_unconfirmed');
        }
        if (paymentId) await cancelPayment(pi, paymentId).catch(() => undefined);
        await store.update('testnet_payouts', mine, { status: 'failed' });
        throw new HttpError(502, 'L’envoi de test a échoué. Réessayez plus tard.', 'payout_failed');
      }
      res.json({ ok: true, status: 'completed', amount });
    }),
  );
  return r;
}

/** Administration : compteur, liste, clôture du test. */
export function adminTestnetPayoutRoutes(ctx: Ctx) {
  const { store, config } = ctx;
  const r = Router();
  r.use(requireRole('admin'));

  r.get(
    '/',
    async (_req, res, next) => {
      try {
        const rows = await store.select('testnet_payouts', { order: { col: 'created_at', asc: true } });
        const names = new Map<string, string>();
        for (const p of await store.select('profiles', { in: { id: rows.map((x) => x.profile_id) } })) names.set(p.id, p.pi_username);
        res.json({
          available: payoutAvailable(config),
          closed: await isClosed(store),
          served: rows.filter((x) => x.status !== 'failed').length,
          max: PAYOUT_MAX,
          payouts: rows.map((x) => ({ pi_username: names.get(x.profile_id) ?? '—', status: x.status, created_at: x.created_at })),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  r.post(
    '/close',
    ah(async (req, res) => {
      const [s] = await store.select('app_settings', { eq: { key: CLOSED_KEY }, limit: 1 });
      if (s) await store.update('app_settings', { eq: { key: CLOSED_KEY } }, { value: '1' });
      else await store.insert('app_settings', { key: CLOSED_KEY, value: '1' });
      await logAdmin(store, req.user!.id as string, 'testnet_payout.close', 'settings', null, {});
      res.json({ ok: true, closed: true });
    }),
  );
  return r;
}
