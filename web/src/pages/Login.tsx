import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Logo } from '../components/Layout';
import { Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';

/** Redirection sûre : uniquement des chemins internes. */
const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') && !n.includes('\\') ? n : '/');

export default function Login() {
  const { ready, user, config, loginWithPi, loginDemo } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = safeNext(params.get('next'));

  if (!ready) return <Spinner />;
  if (user) return <Navigate to={next} replace />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      nav(next, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <Logo />
      <h1>Bienvenue</h1>
      <p>Connectez-vous pour accéder à la boutique, passer vos commandes et suivre vos échanges.</p>

      <button className="btn btn-primary btn-block" disabled={busy} onClick={() => run(loginWithPi)}>
        <KeyRound size={18} aria-hidden /> {busy ? 'Connexion en cours…' : 'Se connecter avec Pi'}
      </button>
      <p className="muted small">
        La connexion Pi fonctionne dans <strong>Pi Browser</strong>. EMADECO ne vous demande jamais votre phrase secrète Pi.
      </p>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      {config?.demo_mode && (
        <div className="demo-box">
          <h2>Mode démonstration</h2>
          <p className="small">Données fictives en mémoire — réservé aux essais en local.</p>
          <div className="row-actions">
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => loginDemo('client'))}>
              Client
            </button>
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => loginDemo('provider'))}>
              Prestataire
            </button>
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => loginDemo('admin'))}>
              Admin
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
