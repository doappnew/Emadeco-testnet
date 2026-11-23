/**
 * Intégration du SDK officiel Pi (https://sdk.minepi.com/pi-sdk.js, chargé dans index.html).
 * - Pi.init({ version: '2.0' }) est appelé avant toute autre méthode ;
 * - Pi.authenticate(scopes, onIncompletePaymentFound) renvoie un accessToken ;
 * - seul l'accessToken est envoyé au serveur, qui le vérifie auprès de l'API Pi.
 * EMADECO ne gère aucun paiement : seul le scope « username » est demandé.
 */
interface PiAuthResult {
  accessToken: string;
  user: { uid: string; username?: string };
}
interface PiSdk {
  init(opts: { version: string; sandbox?: boolean }): void;
  authenticate(scopes: string[], onIncompletePaymentFound: (payment: unknown) => void): Promise<PiAuthResult>;
}
declare global {
  interface Window {
    Pi?: PiSdk;
  }
}

let initialised = false;

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

export async function piAuthenticate(opts: { sandbox: boolean }): Promise<string> {
  const Pi = await waitForPi();
  if (!Pi) throw new PiUnavailableError('Pi SDK indisponible');
  if (!initialised) {
    Pi.init(opts.sandbox ? { version: '2.0', sandbox: true } : { version: '2.0' });
    initialised = true;
  }
  const auth = await Pi.authenticate(['username'], () => {
    /* Aucun paiement dans cette application : rien à reprendre. */
  });
  if (!auth?.accessToken) throw new Error('Jeton Pi manquant');
  return auth.accessToken;
}
