import { notify } from '../domain.js';
import type { Store } from '../store/types.js';
import { logger } from './logger.js';

/** Nombre de pionniers à valider pendant le test Testnet. */
export const PIONEER_MAX = 5;

export const PIONEER_NOTICE = {
  title: 'Test de paiement Testnet',
  body: 'Aidez-nous à valider l’application : passez une commande d’essai avec un produit de la boutique et payez-la en Pi Testnet. Aucun Pi réel n’est utilisé.',
};

export const validatedCount = (store: Store) => store.count('pioneer_test', { eq: { paid_ok: true } });

/**
 * Première connexion d'un compte : crée sa ligne de suivi et la notification, UNE seule fois
 * (la clé primaire profile_id garantit un seul enregistrement par compte).
 */
export async function onFirstLogin(store: Store, profileId: string): Promise<boolean> {
  try {
    const [existing] = await store.select('pioneer_test', { eq: { profile_id: profileId }, limit: 1 });
    if (existing) return false;
    await store.insert('pioneer_test', { profile_id: profileId, login_ok: true, paid_ok: false });
    await notify(store, { user_id: profileId, type: 'system', ...PIONEER_NOTICE });
    return true;
  } catch (e) {
    // Insertion concurrente (clé primaire) ou incident : jamais bloquant pour la connexion.
    logger.warn('pionniers: première connexion non enregistrée', { reason: e instanceof Error ? e.message.slice(0, 80) : 'inconnue' });
    return false;
  }
}

/**
 * Appelé quand le serveur a vérifié le paiement auprès de l'API Pi et passé la commande à « payée ».
 * Marque paid_ok une seule fois par compte, dans la limite de PIONEER_MAX comptes validés.
 */
export async function onOrderPaid(store: Store, profileId: string, orderId: string): Promise<boolean> {
  try {
    let [row] = await store.select('pioneer_test', { eq: { profile_id: profileId }, limit: 1 });
    if (!row) {
      [row] = await store.insert('pioneer_test', { profile_id: profileId, login_ok: true, paid_ok: false });
    }
    if (row!.paid_ok) return false; // un seul pionnier validé par compte
    if ((await validatedCount(store)) >= PIONEER_MAX) return false; // plafond atteint : l'application continue normalement
    const done = await store.update(
      'pioneer_test',
      { eq: { profile_id: profileId, paid_ok: false } },
      { paid_ok: true, order_id: orderId, validated_at: new Date().toISOString() },
    );
    return done.length > 0;
  } catch (e) {
    // Le déclencheur SQL refuse le 6e compte même en cas de requêtes simultanées.
    logger.warn('pionniers: validation non enregistrée', { reason: e instanceof Error ? e.message.slice(0, 80) : 'inconnue' });
    return false;
  }
}
