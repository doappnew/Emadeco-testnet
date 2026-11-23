import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import type { Role } from '../lib/types';
import { Spinner } from './ui';

/** Redirige vers la connexion si l'utilisateur n'est pas connecté (ou n'a pas le bon rôle). */
export function RequireAuth({ children, role }: { children: ReactNode; role?: Role }) {
  const { ready, user } = useAuth();
  const loc = useLocation();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to={`/connexion?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (role && user.role !== role) return <Navigate to="/profil" replace />;
  return <>{children}</>;
}
