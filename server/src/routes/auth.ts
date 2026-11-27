import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { logAdmin, publicProfile, type Ctx } from '../domain.js';
import { forbidden, notFound } from '../lib/errors.js';
import { ah, parse } from '../lib/http.js';
import { onFirstLogin } from '../lib/pioneer.js';
import { logger } from '../lib/logger.js';
import { verifyPiAccessToken } from '../lib/pi.js';
import { signSession } from '../lib/session.js';
import { demoLoginSchema, piLoginSchema } from '../lib/validation.js';
import { DEMO_IDS } from '../store/demoData.js';

export function authRoutes(ctx: Ctx) {
  const r = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { message: 'Trop de tentatives. Réessayez dans quelques minutes.', code: 'rate_limited' } },
  });

  /**
   * Connexion Pi : le navigateur envoie UNIQUEMENT l'accessToken obtenu par Pi.authenticate.
   * Le serveur le vérifie auprès de l'API Pi (GET /v2/me) puis émet sa propre session.
   */
  r.post(
    '/pi',
    limiter,
    ah(async (req, res) => {
      const { accessToken } = parse(piLoginSchema, req.body);
      const pi = await verifyPiAccessToken(accessToken, { apiBase: ctx.config.pi.apiBase, fetchImpl: ctx.fetchImpl });

      let [profile] = await ctx.store.select('profiles', { eq: { pi_uid: pi.uid }, limit: 1 });
      const isBootstrapAdmin = ctx.config.adminUsernames.includes(pi.username.toLowerCase());

      if (!profile) {
        [profile] = await ctx.store.insert('profiles', {
          pi_uid: pi.uid,
          pi_username: pi.username,
          role: isBootstrapAdmin ? 'admin' : 'client',
          status: 'active',
          is_demo: false,
          updated_at: new Date().toISOString(),
        });
        if (isBootstrapAdmin) await logAdmin(ctx.store, profile.id, 'admin.bootstrap', 'user', profile.id, { via: 'ADMIN_PI_USERNAMES' });
      } else {
        const patch: Record<string, unknown> = {};
        if (profile.pi_username !== pi.username) patch.pi_username = pi.username;
        if (isBootstrapAdmin && profile.role !== 'admin' && profile.status === 'active') {
          patch.role = 'admin';
        }
        if (Object.keys(patch).length) {
          [profile] = await ctx.store.update('profiles', { eq: { id: profile.id } }, patch);
          if (patch.role) await logAdmin(ctx.store, profile.id, 'admin.bootstrap', 'user', profile.id, { via: 'ADMIN_PI_USERNAMES' });
        }
      }

      if (profile.status !== 'active') throw forbidden('Votre compte est suspendu.');
      if (ctx.config.pi.network === 'testnet') await onFirstLogin(ctx.store, profile.id);
      logger.info('auth: connexion Pi réussie', { role: profile.role });
      res.json({ token: signSession(profile.id, ctx.config.sessionSecret), profile: publicProfile(profile) });
    }),
  );

  /** Connexion de démonstration : absente en production, uniquement avec la base en mémoire. */
  r.post(
    '/demo',
    limiter,
    ah(async (req, res) => {
      if (!ctx.config.demoMode || ctx.store.kind !== 'memory') throw notFound();
      const { role } = parse(demoLoginSchema, req.body);
      const id = role === 'admin' ? DEMO_IDS.admin : role === 'provider' ? DEMO_IDS.providerProfile : DEMO_IDS.client;
      const [profile] = await ctx.store.select('profiles', { eq: { id }, limit: 1 });
      if (!profile) throw notFound();
      res.json({ token: signSession(profile.id, ctx.config.sessionSecret), profile: publicProfile(profile) });
    }),
  );

  return r;
}
