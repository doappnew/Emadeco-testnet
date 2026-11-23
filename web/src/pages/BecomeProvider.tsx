import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Field, useToast } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { splitList } from '../lib/format';

export default function BecomeProvider() {
  const { user, provider, refresh } = useAuth();
  const nav = useNavigate();
  const { toast } = useToast();
  const [f, setF] = useState({ business_name: '', bio: '', specialties: '', zones: '', city: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (provider || user?.role === 'provider') return <Navigate to="/espace-prestataire" replace />;
  if (user?.role === 'admin') return <Navigate to="/profil" replace />;

  const submit = async () => {
    if (f.business_name.trim().length < 2) return setErr('Indiquez le nom de votre activité.');
    setBusy(true);
    setErr(null);
    try {
      await api.post('/me/provider', {
        business_name: f.business_name.trim(),
        bio: f.bio.trim() || undefined,
        specialties: splitList(f.specialties, 12),
        service_zones: splitList(f.zones, 20),
        city: f.city.trim() || undefined,
      });
      await refresh();
      toast('Candidature envoyée : un administrateur va valider votre profil.');
      nav('/espace-prestataire', { replace: true });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="page-title">Devenir prestataire</h1>
      <p className="muted">
        Présentez votre activité de décoration ou de location de matériel. Votre profil sera visible des clients après validation par l’équipe EMADECO.
      </p>
      <div className="form">
        <Field label="Nom de l’activité *">
          <input value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} maxLength={100} />
        </Field>
        <Field label="Présentation">
          <textarea rows={4} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} maxLength={2000} />
        </Field>
        <Field label="Spécialités" hint="Séparées par des virgules : Mariages, Ballons, Location de matériel…">
          <input value={f.specialties} onChange={(e) => setF({ ...f, specialties: e.target.value })} />
        </Field>
        <Field label="Zones desservies" hint="Villes séparées par des virgules.">
          <input value={f.zones} onChange={(e) => setF({ ...f, zones: e.target.value })} />
        </Field>
        <Field label="Ville principale">
          <input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} maxLength={80} />
        </Field>
        {err && (
          <p className="notice notice-error" role="alert">
            {err}
          </p>
        )}
        <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
          {busy ? 'Envoi…' : 'Envoyer ma candidature'}
        </button>
      </div>
    </>
  );
}
