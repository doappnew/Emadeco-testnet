import { Router } from 'express';
import type { Ctx } from '../domain.js';
import { ah } from '../lib/http.js';
import { PIONEER_MAX, validatedCount } from '../lib/pioneer.js';
import { requireAuth, requireRole } from '../middleware.js';

/** Suivi du test Testnet pour l'utilisateur connecté (écran Profil, bannière d'accueil). */
export function pioneerRoutes(ctx: Ctx) {
  const { store } = ctx;
  const r = Router();
  r.use(requireAuth);
  r.get(
    '/status',
    ah(async (req, res) => {
      const enabled = ctx.config.pi.network === 'testnet';
      const [row] = await store.select('pioneer_test', { eq: { profile_id: req.user!.id }, limit: 1 });
      res.json({
        enabled,
        login_ok: Boolean(row?.login_ok) || enabled,
        paid_ok: Boolean(row?.paid_ok),
        validated: await validatedCount(store),
        max: PIONEER_MAX,
      });
    }),
  );
  return r;
}

/** Administration : compteur et liste des pionniers validés. */
export function adminPioneerRoutes(ctx: Ctx) {
  const { store } = ctx;
  const r = Router();
  r.use(requireRole('admin'));
  r.get(
    '/',
    ah(async (_req, res) => {
      const rows = await store.select('pioneer_test', { eq: { paid_ok: true }, order: { col: 'validated_at', asc: true } });
      const names = new Map<string, string>();
      for (const p of await store.select('profiles', { in: { id: rows.map((x) => x.profile_id) } })) names.set(p.id, p.pi_username);
      res.json({
        count: rows.length,
        max: PIONEER_MAX,
        pioneers: rows.map((x) => ({ pi_username: names.get(x.profile_id) ?? '—', validated_at: x.validated_at })),
      });
    }),
  );
  return r;
}
