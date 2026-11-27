import { HttpError } from './errors.js';
import { logger } from './logger.js';
import type { FetchLike } from './pi.js';

/** Paiement tel que renvoyé par l'API Pi (champs utilisés uniquement). */
export interface PiPayment {
  identifier: string;
  user_uid: string;
  amount: number;
  memo?: string;
  /** Paiement A2U : adresses (G…) de l'application et de l'utilisateur, et réseau (« Pi Testnet » / « Pi Network »). */
  from_address?: string;
  to_address?: string;
  network?: string;
  metadata?: Record<string, unknown>;
  status: {
    developer_approved?: boolean;
    transaction_verified?: boolean;
    developer_completed?: boolean;
    cancelled?: boolean;
    user_cancelled?: boolean;
  };
  transaction?: { txid?: string; verified?: boolean } | null;
}

export interface PiApiOpts {
  apiBase: string;
  apiKey: string | null;
  fetchImpl?: FetchLike;
}

/**
 * Appels serveur à l'API Pi pour les paiements (clé « Key <PI_API_KEY> »).
 * Journalise uniquement le code HTTP et le code d'erreur Pi, jamais la clé.
 */
async function call(opts: PiApiOpts, method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
  if (!opts.apiKey) throw new HttpError(503, 'Le paiement Pi n’est pas encore configuré sur le serveur.', 'payments_unconfigured');
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  let res: Response;
  try {
    res = await doFetch(`${opts.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Key ${opts.apiKey}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    logger.error(`payments: API Pi ${method} ${path.replace(/\/[^/]+(?=\/|$)/, '/{id}')} injoignable`);
    throw new HttpError(502, 'Le service Pi est momentanément injoignable. Réessayez.', 'pi_unreachable');
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* corps vide */
  }
  if (!res.ok) {
    const code = typeof data?.error === 'string' ? data.error : typeof data?.error_message === 'string' ? 'error' : 'unknown';
    logger.error(`payments: API Pi ${method} /${path.split('/')[1]}/{id}${path.endsWith('/approve') ? '/approve' : path.endsWith('/complete') ? '/complete' : ''} ${res.status} ${code}`);
    throw new HttpError(res.status === 404 ? 404 : 502, 'Le paiement Pi a été refusé ou est introuvable.', 'pi_payment_error');
  }
  return data;
}

const enc = encodeURIComponent;

export const getPayment = (o: PiApiOpts, id: string) => call(o, 'GET', `/payments/${enc(id)}`) as Promise<PiPayment>;
export const approvePayment = (o: PiApiOpts, id: string) => call(o, 'POST', `/payments/${enc(id)}/approve`, {});
export const completePayment = (o: PiApiOpts, id: string, txid: string) =>
  call(o, 'POST', `/payments/${enc(id)}/complete`, { txid });

/** Paiement application → utilisateur (A2U) : le serveur fixe le montant et le destinataire (uid). */
export const createA2UPayment = (o: PiApiOpts, p: { amount: number; memo: string; metadata: Record<string, unknown>; uid: string }) =>
  call(o, 'POST', '/payments', { payment: p }) as Promise<PiPayment>;
export const cancelPayment = (o: PiApiOpts, id: string) => call(o, 'POST', `/payments/${enc(id)}/cancel`, {});

/** Montant en chaîne à 4 décimales, pour comparer sans erreur d'arrondi flottant. */
export const amt = (n: unknown) => Number(n).toFixed(4);
