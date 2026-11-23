import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from './lib/errors.js';
import { verifySession } from './lib/session.js';
import type { Ctx } from './domain.js';
import type { Row } from './store/types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: Row;
      suspended?: boolean;
    }
  }
}

/**
 * Identifie l'utilisateur depuis « Authorization: Bearer <session> ».
 * Le rôle et le statut du compte sont relus en base à CHAQUE appel : une suspension
 * ou un changement de rôle prend effet immédiatement, sans attendre l'expiration du jeton.
 */
export function attachUser(ctx: Ctx) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.header('authorization');
      const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
      if (token) {
        const id = verifySession(token, ctx.config.sessionSecret);
        if (id) {
          const [profile] = await ctx.store.select('profiles', { eq: { id }, limit: 1 });
          if (profile) {
            if (profile.status === 'active') req.user = profile;
            else req.suspended = true;
          }
        }
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (req.user) return next();
  next(req.suspended ? forbidden('Votre compte est suspendu.') : unauthorized());
}

export const requireRole =
  (...roles: Array<'client' | 'provider' | 'admin'>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(req.suspended ? forbidden('Votre compte est suspendu.') : unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
