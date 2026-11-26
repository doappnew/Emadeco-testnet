import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { ZodError } from 'zod';
import type { Ctx } from './domain.js';
import { HttpError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { attachUser } from './middleware.js';
import { StoreError } from './store/types.js';
import { adminRoutes } from './routes/admin.js';
import { adminShopRoutes } from './routes/adminShop.js';
import { shopRoutes } from './routes/shop.js';
import { authRoutes } from './routes/auth.js';
import { catalogRoutes } from './routes/catalog.js';
import { meRoutes } from './routes/me.js';
import { providerRoutes } from './routes/provider.js';
import { requestRoutes } from './routes/requests.js';

export function createApp(ctx: Ctx) {
  const { config } = ctx;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render / reverse proxy : IP réelle pour le rate limiting

  // En-têtes de sécurité. Le SDK Pi est chargé depuis sdk.minepi.com ; Pi Browser (et le bac à sable
  // Pi) peuvent embarquer l'application dans un cadre : frame-ancestors autorise les domaines Pi.
  app.use(
    helmet({
      frameguard: false,
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'", 'https://sdk.minepi.com'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:', 'https://*.supabase.co'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'", 'https://*.minepi.com'],
          'frame-src': ['https://*.minepi.com', 'https://*.pinet.com'],
          'frame-ancestors': ["'self'", 'https://*.minepi.com', 'https://*.pinet.com'],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
        },
      },
    }),
  );

  app.use(express.json({ limit: '50kb' }));

  // Clé de vérification de domaine Pi (Developer Portal) : /validation-key.txt
  app.get('/validation-key.txt', (req, res, next) => {
    if (!config.pi.validationKey) return next();
    res.type('text/plain').send(config.pi.validationKey);
  });

  const api = express.Router();
  api.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 600,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { message: 'Trop de requêtes. Réessayez dans quelques minutes.', code: 'rate_limited' } },
    }),
  );
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  api.get('/health', (_req, res) => {
    res.json({ ok: true, store: ctx.store.kind });
  });

  // Configuration publique utile au frontend (aucun secret).
  api.get('/config', (_req, res) => {
    res.json({
      demo_mode: config.demoMode && ctx.store.kind === 'memory',
      pi_network: config.pi.network,
      pi_sandbox: config.pi.sandbox,
    });
  });

  api.use(attachUser(ctx));
  api.use('/auth', authRoutes(ctx));
  api.use(catalogRoutes(ctx));
  api.use('/provider', providerRoutes(ctx));
  api.use('/shop', shopRoutes(ctx));
  api.use('/admin/shop', adminShopRoutes(ctx));
  api.use('/admin', adminRoutes(ctx));
  api.use(meRoutes(ctx));
  api.use(requestRoutes(ctx));
  api.use((_req, _res, next) => next(new HttpError(404, 'Route introuvable.', 'not_found')));
  app.use('/api', api);

  // Frontend compilé (SPA) : fichiers statiques puis repli sur index.html
  const indexHtml = path.join(config.webDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.webDir, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  // Gestionnaire d'erreurs central : jamais de trace ni de secret renvoyés au client.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { message: err.message, code: err.code ?? 'error' } });
    }
    if (err instanceof ZodError) {
      return res.status(400).json({ error: { message: 'Données invalides.', code: 'validation' } });
    }
    const type = (err as { type?: string }).type;
    if (type === 'entity.too.large') return res.status(413).json({ error: { message: 'Requête trop volumineuse.', code: 'too_large' } });
    if (type === 'entity.parse.failed') return res.status(400).json({ error: { message: 'JSON invalide.', code: 'bad_json' } });
    if (err instanceof StoreError) {
      return res.status(500).json({ error: { message: 'Erreur interne. Réessayez plus tard.', code: 'db_error' } });
    }
    logger.error('erreur non gérée', { path: req.path, name: err instanceof Error ? err.name : 'inconnue', message: err instanceof Error ? err.message : undefined });
    res.status(500).json({ error: { message: 'Erreur interne. Réessayez plus tard.', code: 'internal' } });
  });

  return app;
}
