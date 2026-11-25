import { logger } from './logger.js';

/**
 * Système d'éveil : sur l'offre gratuite de Render, le service s'endort après
 * ~15 min sans visite. Ce minuteur appelle /api/health par l'adresse publique
 * toute les 10 min, ce qui compte comme du trafic entrant.
 * Il s'active seul sur Render (RENDER_EXTERNAL_URL) ou via KEEP_ALIVE_URL.
 * Désactivable avec KEEP_ALIVE=false.
 */
export function startKeepAlive(env: NodeJS.ProcessEnv = process.env): (() => void) | null {
  if (env.KEEP_ALIVE === 'false') return null;
  const base = (env.KEEP_ALIVE_URL || env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) return null;
  const url = `${base}/api/health`;
  const every = 10 * 60 * 1000;
  const timer = setInterval(async () => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      logger.info('keep-alive', { status: r.status });
    } catch (e) {
      logger.warn('keep-alive échec', { message: e instanceof Error ? e.message : String(e) });
    }
  }, every);
  timer.unref();
  logger.info('keep-alive actif', { url, minutes: 10 });
  return () => clearInterval(timer);
}
