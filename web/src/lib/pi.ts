/**
 * Intégration du SDK officiel Pi (https://sdk.minepi.com/pi-sdk.js, chargé dans index.html).
 * - Pi.init({ version: '2.0' }) est appelé avant toute autre méthode ;
 * - Pi.authenticate(scopes, onIncompletePaymentFound) renvoie un accessToken ;
 * - seul l'accessToken est envoyé au serveur, qui le vérifie auprès de l'API Pi ;
 * - Pi.createPayment : le serveur approuve puis finalise (il décide du montant, pas le navigateur).
 */
interface PiAuthResult {
  accessToken: string;
  user: { uid: string; username?: string };
}
interface PiPaymentCallbacks {
  onReadyForServerApproval(paymentId: string): void;
  onReadyForServerCompletion(paymentId: string, txid: string): void;
  onCancel(paymentId: string): void;
  onError(error: Error, payment?: unknown): void;
}
interface PiSdk {
  init(opts: { version: string; sandbox?: boolean }): void;
  authenticate(scopes: string[], onIncompletePaymentFound: (payment: { identifier: string }) => void): Promise<PiAuthResult>;
  createPayment(data: { amount: number; memo: string; metadata: Record<string, unknown> }, callbacks: PiPaymentCallbacks): void;
}
declare global {
  interface Window {
    Pi?: PiSdk;
  }
}

let initialised = false;
// La connexion ne demande que « username ». Le droit « payments » n'est demandé qu'au moment de payer.
const LOGIN_SCOPES = ['username'];
const PAY_SCOPES = ['username', 'payments'];

/** Attend la présence du SDK (script chargé en différé) sans bloquer indéfiniment. */
function waitForPi(timeoutMs = 4000): Promise<PiSdk | null> {
  return new Promise((resolve) => {
    if (window.Pi) return resolve(window.Pi);
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.Pi) {
        clearInterval(timer);
        resolve(window.Pi);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, 150);
  });
}

export class PiUnavailableError extends Error {}

async function sdk(sandbox: boolean): Promise<PiSdk> {
  const Pi = await waitForPi();
  if (!Pi) throw new PiUnavailableError('Pi SDK indisponible');
  if (!initialised) {
    Pi.init(sandbox ? { version: '2.0', sandbox: true } : { version: '2.0' });
    initialised = true;
  }
  return Pi;
}

/** Connexion Pi. `onIncomplete` reçoit l'identifiant d'un éventuel paiement resté en suspens. */
export async function piAuthenticate(opts: { sandbox: boolean; onIncomplete?: (paymentId: string) => void }): Promise<string> {
  const Pi = await sdk(opts.sandbox);
  const auth = await Pi.authenticate(LOGIN_SCOPES, (p) => opts.onIncomplete?.(p.identifier));
  if (!auth?.accessToken) throw new Error('Jeton Pi manquant');
  return auth.accessToken;
}

export interface PayOptions {
  sandbox: boolean;
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
  onApprove: (paymentId: string) => Promise<void>;
  onComplete: (paymentId: string, txid: string) => Promise<void>;
  onIncomplete: (paymentId: string) => Promise<void>;
}

/** Lance un paiement Pi ; résout « paid » après finalisation serveur, « cancelled » si l'utilisateur annule. */
export async function piPay(o: PayOptions): Promise<'paid' | 'cancelled'> {
  const Pi = await sdk(o.sandbox);
  // Garantit que le droit « payments » est accordé (session ouverte avant l'ajout des paiements).
  const pending: string[] = [];
  await Pi.authenticate(PAY_SCOPES, (p) => pending.push(p.identifier));
  for (const id of pending) await o.onIncomplete(id).catch(() => undefined);

  return new Promise((resolve, reject) => {
    Pi.createPayment(
      { amount: o.amount, memo: o.memo, metadata: o.metadata },
      {
        onReadyForServerApproval: (id) => {
          o.onApprove(id).catch(reject);
        },
        onReadyForServerCompletion: (id, txid) => {
          o.onComplete(id, txid).then(() => resolve('paid'), reject);
        },
        onCancel: () => resolve('cancelled'),
        onError: (err) => reject(err instanceof Error ? err : new Error('Paiement Pi impossible.')),
      },
    );
  });
}
