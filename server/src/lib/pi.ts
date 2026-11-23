import { HttpError, unauthorized } from './errors.js';
import { logger } from './logger.js';

export interface PiUser {
  uid: string;
  username: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Vérifie un accessToken Pi côté serveur : GET {PI_API_BASE}/me avec
 * « Authorization: Bearer <accessToken> » (documentation Pi, « Authenticate a user »).
 * Cet appel n'exige pas la clé API serveur. On ne fait jamais confiance à l'uid
 * ou au nom d'utilisateur envoyés par le navigateur.
 */
export async function verifyPiAccessToken(
  accessToken: unknown,
  opts: { apiBase: string; fetchImpl?: FetchLike },
): Promise<PiUser> {
  if (typeof accessToken !== 'string' || accessToken.length < 8 || accessToken.length > 4096 || /\s/.test(accessToken)) {
    throw unauthorized('Jeton Pi invalide.');
  }
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  let res: Response;
  try {
    res = await doFetch(`${opts.apiBase}/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    logger.error('auth: API Pi injoignable', { reason: err instanceof Error ? err.name : 'inconnue' });
    throw new HttpError(502, 'Le service Pi est momentanément injoignable. Réessayez.', 'pi_unreachable');
  }

  if (res.status === 401 || res.status === 403) {
    logger.warn(`auth: API Pi GET /me ${res.status}`);
    throw unauthorized('Votre session Pi est invalide ou expirée. Reconnectez-vous.');
  }
  if (!res.ok) {
    logger.error(`auth: API Pi GET /me ${res.status}`);
    throw new HttpError(502, 'Vérification Pi impossible pour le moment.', 'pi_error');
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new HttpError(502, 'Réponse Pi illisible.', 'pi_error');
  }
  const b = body as { uid?: unknown; username?: unknown };
  if (typeof b?.uid !== 'string' || !b.uid || typeof b.username !== 'string' || !b.username) {
    logger.error('auth: réponse /me sans uid ou username (scope « username » demandé ?)');
    throw new HttpError(502, 'Réponse Pi incomplète : le scope « username » est requis.', 'pi_error');
  }
  return { uid: b.uid.slice(0, 128), username: b.username.slice(0, 64) };
}
