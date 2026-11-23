import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './components/guards';
import Layout from './components/Layout';
import { EmptyState, Spinner, ToastProvider } from './components/ui';
import { AuthProvider } from './lib/auth';
import BecomeProvider from './pages/BecomeProvider';
import Explore from './pages/Explore';
import Favorites from './pages/Favorites';
import Home from './pages/Home';
import Login from './pages/Login';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import ProviderPage from './pages/ProviderPage';
import RequestDetail from './pages/RequestDetail';
import RequestNew from './pages/RequestNew';
import Requests from './pages/Requests';

// Espaces peu fréquents : chargés à la demande pour alléger le premier affichage (connexions mobiles lentes).
const ProviderDashboard = lazy(() => import('./pages/provider/ProviderDashboard'));
const AdminPage = lazy(() => import('./pages/admin/AdminPage'));

const NotFound = () => (
  <EmptyState
    title="Page introuvable"
    action={
      <Link to="/" className="btn btn-primary">
        Retour à l’accueil
      </Link>
    }
  />
);

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="explorer" element={<Explore />} />
                <Route path="prestataire/:id" element={<ProviderPage />} />
                <Route path="connexion" element={<Login />} />
                <Route path="demande/nouvelle" element={<RequireAuth><RequestNew /></RequireAuth>} />
                <Route path="demandes" element={<RequireAuth><Requests /></RequireAuth>} />
                <Route path="demandes/:id" element={<RequireAuth><RequestDetail /></RequireAuth>} />
                <Route path="favoris" element={<RequireAuth><Favorites /></RequireAuth>} />
                <Route path="profil" element={<RequireAuth><Profile /></RequireAuth>} />
                <Route path="notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
                <Route path="devenir-prestataire" element={<RequireAuth><BecomeProvider /></RequireAuth>} />
                <Route path="espace-prestataire" element={<RequireAuth role="provider"><ProviderDashboard /></RequireAuth>} />
                <Route path="admin" element={<RequireAuth role="admin"><AdminPage /></RequireAuth>} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
