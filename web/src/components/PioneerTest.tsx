import { useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';

interface PioneerStatus {
  enabled: boolean;
  login_ok: boolean;
  paid_ok: boolean;
  validated: number;
  max: number;
}

const usePioneer = () => useAsync(() => api.get<PioneerStatus>('/pioneer/status'), []);
const DISMISS_KEY = 'emadeco.pioneerBanner';

/** Écran Profil : avancement du test de paiement Testnet. */
export function PioneerBlock() {
  const { data } = usePioneer();
  if (!data || !data.enabled) return null;
  return (
    <section className="pioneer-card" aria-label="Test de paiement Testnet">
      <h2>Test de paiement Testnet</h2>
      <ol className="pioneer-steps">
        <li>
          1 Connexion <span className="ok">✔</span>
        </li>
        <li>
          2 Paiement de test{' '}
          {data.paid_ok ? (
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
      <p className="pioneer-count">
        Pionniers validés : {data.validated} / {data.max}
      </p>
      <p className="muted small">Réseau Pi Testnet : aucun Pi réel n’est dépensé.</p>
      {!data.paid_ok && (
        <Link to="/boutique" className="btn btn-outline btn-block">
          Passer une commande d’essai
        </Link>
      )}
    </section>
  );
}

/** Accueil : bannière courte tant que le test n'est pas fait ; masquable. */
export function PioneerBanner() {
  const { data } = usePioneer();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (!data || !data.enabled || data.paid_ok || hidden) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* stockage indisponible : masquée pour cette visite seulement */
    }
  };
  return (
    <div className="pioneer-banner" role="note">
      <p>
        <strong>Test de paiement Testnet</strong> — passez une commande d’essai dans la <Link to="/boutique">boutique</Link> et payez-la en Pi Testnet. Aucun Pi réel n’est utilisé.
      </p>
      <button type="button" className="icon-btn" onClick={close} aria-label="Masquer la bannière">
        <X size={18} />
      </button>
    </div>
  );
}
