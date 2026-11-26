import { useState } from 'react';
import { Bell, FileText, Heart, LogOut, Package, Shield, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Field, SectionTitle, useToast } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { initials } from '../lib/format';

const PROVIDER_STATUS: Record<string, string> = {
  pending: 'En cours de validation',
  approved: 'Validé',
  rejected: 'À compléter',
  suspended: 'Suspendu',
};

export default function Profile() {
  const { user, provider, logout, refresh, config } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.display_name ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const save = async () => {
    setBusy(true);
    try {
      await api.patch('/me', { display_name: name.trim(), city: city.trim() });
      await refresh();
      toast('Profil enregistré.');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const shown = user.display_name || user.pi_username;
  return (
    <>
      <div className="profile-head">
        <span className="avatar" aria-hidden>
          {initials(shown)}
        </span>
        <div>
          <h1 className="page-title tight">{shown}</h1>
          <p className="muted">@{user.pi_username}</p>
          <span className="badge badge-info">{user.role === 'admin' ? 'Administrateur' : user.role === 'provider' ? 'Prestataire' : 'Client'}</span>
        </div>
      </div>

      <ul className="menu">
        <li>
          <Link to="/commandes">
            <Package size={20} aria-hidden /> Mes commandes
          </Link>
        </li>
        <li>
          <Link to="/demandes">
            <FileText size={20} aria-hidden /> Mes demandes aux prestataires
          </Link>
        </li>
        <li>
          <Link to="/favoris">
            <Heart size={20} aria-hidden /> Mes favoris
          </Link>
        </li>
        <li>
          <Link to="/notifications">
            <Bell size={20} aria-hidden /> Notifications
          </Link>
        </li>
        {user.role === 'provider' && (
          <li>
            <Link to="/espace-prestataire">
              <Store size={20} aria-hidden /> Espace prestataire
              {provider && <span className="badge badge-muted">{PROVIDER_STATUS[provider.status]}</span>}
            </Link>
          </li>
        )}
        {user.role === 'client' && (
          <li>
            <Link to="/devenir-prestataire">
              <Store size={20} aria-hidden /> Devenir prestataire
            </Link>
          </li>
        )}
        <li>
          <Link to="/confidentialite">
            <Shield size={20} aria-hidden /> Politique de confidentialité
          </Link>
        </li>
        {user.role === 'admin' && (
          <li>
            <Link to="/admin">
              <Shield size={20} aria-hidden /> Administration
            </Link>
          </li>
        )}
      </ul>

      <SectionTitle>Mes informations</SectionTitle>
      <div className="form">
        <Field label="Nom affiché">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={user.pi_username} />
        </Field>
        <Field label="Ville">
          <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />
        </Field>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          Enregistrer
        </button>
      </div>

      <button className="btn btn-outline btn-block logout" onClick={logout}>
        <LogOut size={18} aria-hidden /> Se déconnecter
      </button>
      <p className="muted small center">
        EMADECO — Excellence, professionnalisme, innovation et respect.
        {config && <> Réseau Pi : {config.pi_network === 'mainnet' ? 'Mainnet' : 'Testnet'}.</>}
      </p>
    </>
  );
}
