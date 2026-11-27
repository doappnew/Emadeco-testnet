import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useToast } from './ui';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync } from '../lib/hooks';
import { piRequestWalletScope } from '../lib/pi';
import { bannerVisible, payoutView } from '../lib/testnetVisibility';

interface TestStatus {
  available: boolean;
  closed: boolean;
  served: number;
  max: number;
  offer: boolean;
  received: boolean;
  pending: boolean;
  amount: number;
  payment_check: { enabled: boolean; done: boolean };
}

const useStatus = () => useAsync(() => api.get<TestStatus>('/testnet-payout/status'), []);

const read = (k: string) => {
  try {
    return localStorage.getItem(k) === '1';
  } catch {
    return false;
  }
};
const write = (k: string) => {
  try {
    localStorage.setItem(k, '1');
  } catch {
    /* stockage indisponible : le message reste visible pour cette visite seulement */
  }
};
const ACK_KEY = 'emadeco.payoutReceivedSeen';
const BANNER_KEY = 'emadeco.payoutBanner';

/** Test de paiement (U2A) : facultatif et ouvert à tous, sans limite de comptes — simple liste de contrôle. */
export function PaymentChecklist() {
  const { data } = useStatus();
  if (!data || !data.payment_check.enabled) return null;
  const done = data.payment_check.done;
  return (
    <section className="pioneer-card" aria-label="Test de paiement Testnet">
      <h2>Test de paiement Testnet</h2>
      <p className="muted small">Facultatif : ouvert à tous les utilisateurs.</p>
      <ol className="pioneer-steps">
        <li>
          1 Connexion <span className="ok">✔</span>
        </li>
        <li>
          2 Paiement de test{' '}
          {done ? (
            <span className="ok" aria-label="fait">
              ✔
            </span>
          ) : (
            <span className="ko" aria-label="pas encore fait">
              ✖
            </span>
          )}
        </li>
      </ol>
      <p className="muted small">Réseau Pi Testnet : aucun Pi réel n’est dépensé.</p>
      {!done && (
        <Link to="/boutique" className="btn btn-outline btn-block">
          Passer une commande d’essai
        </Link>
      )}
    </section>
  );
}

/**
 * Test de réception (A2U) : bloc du Profil. Retiré dès que l'envoi est reçu (message « reçu » affiché une seule fois),
 * quand les 5 pionniers sont servis, quand l'administrateur clôture le test ou quand il est désactivé.
 */
export function PayoutBlock() {
  const { data, reload } = useStatus();
  const { config } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [justReceived, setJustReceived] = useState(false);
  const [seenBefore] = useState(() => read(ACK_KEY));

  const view = payoutView(data, { seenBefore, justReceived });
  useEffect(() => {
    if (view === 'received') write(ACK_KEY); // visible cette fois, plus jamais aux visites suivantes
  }, [view]);

  if (!data || view === 'none') return null;

  if (view === 'received') {
    return (
      <section className="pioneer-card" aria-label="Test de réception Testnet">
        <h2>Test de réception Testnet</h2>
        <p className="pioneer-count">Envoi de test reçu ✔</p>
        <p className="muted small">Réseau Pi Testnet : aucun Pi réel n’est dépensé.</p>
      </section>
    );
  }

  const receive = async () => {
    setBusy(true);
    try {
      await piRequestWalletScope({ sandbox: config?.pi_sandbox ?? false }); // droit d'adresse demandé ici seulement
      await api.post('/testnet-payout', {});
      setJustReceived(true);
      toast('Envoi de test reçu ✔');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
      reload();
    }
  };

  return (
    <section className="pioneer-card" aria-label="Test de réception Testnet">
      <h2>Test de réception Testnet</h2>
      <p className="muted small">Cinq pionniers reçoivent un petit envoi de test de l’application ({data.amount} Pi Testnet).</p>
      <button className="btn btn-primary btn-block" onClick={receive} disabled={busy}>
        {busy ? 'Envoi en cours…' : 'Recevoir mon envoi de test (Testnet)'}
      </button>
      <p className="muted small">Réseau Pi Testnet : aucun Pi réel n’est dépensé.</p>
    </section>
  );
}

/** Accueil : bannière tant que le test de réception est proposé ; masquable. */
export function PayoutBanner() {
  const { data } = useStatus();
  const [hidden, setHidden] = useState(() => read(BANNER_KEY));
  if (!data || !bannerVisible(data, hidden)) return null;
  return (
    <div className="pioneer-banner" role="note">
      <p>
        <strong>Test de réception Testnet</strong> — 5 pionniers peuvent recevoir un envoi de test. Ouvrez <Link to="/profil">Profil</Link>. Aucun Pi réel n’est utilisé.
      </p>
      <button
        type="button"
        className="icon-btn"
        aria-label="Masquer la bannière"
        onClick={() => {
          setHidden(true);
          write(BANNER_KEY);
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}
