import { Bell, Compass, Home, Package, Store, User } from 'lucide-react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const TABS = [
  { to: '/', label: 'Accueil', icon: Home, end: true },
  { to: '/boutique', label: 'Boutique', icon: Store },
  { to: '/explorer', label: 'Prestataires', icon: Compass },
  { to: '/commandes', label: 'Commandes', icon: Package },
  { to: '/profil', label: 'Profil', icon: User },
];

export function Logo({ small }: { small?: boolean }) {
  return (
    <span className={`logo ${small ? 'logo-sm' : ''}`} aria-label="EMADECO">
      <span className="logo-mark" aria-hidden>
        E
      </span>
      <span className="logo-text">
        <strong>EMADECO</strong>
        {!small && <em>Événements &amp; Décoration</em>}
      </span>
    </span>
  );
}

/** Coque de l'application : en-tête, contenu, navigation mobile à cinq onglets. */
export default function Layout() {
  const { ready, user, unread, config } = useAuth();
  const { pathname } = useLocation();
  // Pas de navigation tant que le pionnier n'est pas connecté : la connexion vient d'abord.
  const hideNav = !ready || !user || pathname.startsWith('/demande/nouvelle') || pathname.startsWith('/admin') || pathname.endsWith('/commande');

  return (
    <div className={`shell ${hideNav ? 'shell-nonav' : ''}`}>
      {config?.demo_mode && (
        <div className="demo-banner" role="note">
          MODE DÉMONSTRATION — données fictives, aucune connexion Pi réelle
        </div>
      )}
      <header className="topbar">
        <Link to="/" aria-label="Accueil EMADECO">
          <Logo small />
        </Link>
        {user && (
          <Link to="/notifications" className="icon-btn" aria-label={`Notifications${unread ? `, ${unread} non lues` : ''}`}>
            <Bell size={22} />
            {unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
          </Link>
        )}
      </header>
      <main className="page">
        <Outlet />
      </main>
      {!hideNav && (
        <nav className="tabbar" aria-label="Navigation principale">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}>
              <Icon size={22} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
