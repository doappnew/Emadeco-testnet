/** Règles d'affichage du test de réception (sans dépendance au navigateur : testables seules). */
export interface PayoutStatus {
  available: boolean;
  closed: boolean;
  offer: boolean;
  received: boolean;
}

export type PayoutView = 'none' | 'received' | 'offer';

/**
 * Bloc du Profil : retiré si test désactivé (d), clos (c) ou plafond atteint (b, via `offer`) ;
 * après réception (a), le message « reçu » n'apparaît qu'une seule fois.
 */
export function payoutView(s: PayoutStatus | null, o: { seenBefore: boolean; justReceived: boolean }): PayoutView {
  if (!s || !s.available || s.closed) return 'none';
  if (s.received) return o.justReceived || !o.seenBefore ? 'received' : 'none';
  return s.offer ? 'offer' : 'none';
}

/** Bannière d'accueil : seulement tant que le test est proposé et qu'elle n'a pas été masquée. */
export const bannerVisible = (s: PayoutStatus | null, hidden: boolean) => Boolean(s && s.offer && !hidden);
