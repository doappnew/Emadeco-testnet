import type { Config } from '../config.js';
import type { Row, Store } from '../store/types.js';
import { isSeedFormat } from './stellar.js';

/** Nombre de pionniers du test de réception. */
export const PAYOUT_MAX = 5;
export const CLOSED_KEY = 'testnet_payout_closed';

export const PAYOUT_NOTICE = {
  title: 'Test de réception Testnet',
  body: 'Test de réception Testnet : cinq pionniers peuvent recevoir un petit envoi de test de l’application. Ouvrez Profil et appuyez sur « Recevoir mon envoi de test ». Aucun Pi réel n’est utilisé.',
};

/** Route ouverte seulement si TESTNET_PAYOUT=1, PI_API_KEY et PI_WALLET_SEED présents, réseau Testnet. */
export const payoutAvailable = (c: Config): boolean =>
  c.testnetPayout.enabled && Boolean(c.pi.apiKey) && isSeedFormat(c.testnetPayout.walletSeed) && c.pi.network === 'testnet';

export async function isClosed(store: Store): Promise<boolean> {
  const [s] = await store.select('app_settings', { eq: { key: CLOSED_KEY }, limit: 1 });
  return s?.value === '1';
}

/** Comptes servis ou en cours (statut ≠ failed) : ce sont eux qui comptent pour le plafond. */
export const servedCount = (store: Store) => store.count('testnet_payouts', { neq: { status: 'failed' } });

export interface PayoutState {
  available: boolean;
  closed: boolean;
  served: number;
  max: number;
  mine: Row | undefined;
}

export async function payoutState(config: Config, store: Store, profileId: string): Promise<PayoutState> {
  const [closed, served, [mine]] = await Promise.all([
    isClosed(store),
    servedCount(store),
    store.select('testnet_payouts', { eq: { profile_id: profileId }, limit: 1 }),
  ]);
  return { available: payoutAvailable(config), closed, served, max: PAYOUT_MAX, mine };
}

/** Le bouton, la bannière et la notification sont proposés tant que : disponible, non clos, plafond non atteint, pas encore servi. */
export const canOffer = (s: PayoutState) => s.available && !s.closed && s.served < s.max && (!s.mine || s.mine.status === 'failed');
