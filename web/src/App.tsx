import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './components/guards';
import Layout from './components/Layout';
import Splash from './components/Splash';
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
import Privacy from './pages/Privacy';
import Requests from './pages/Requests';
import Checkout from './pages/shop/Checkout';
import OrderDetail from './pages/shop/OrderDetail';
import Orders from './pages/shop/Orders';
import ProductPage from './pages/shop/ProductPage';
import Shop from './pages/shop/Shop';
import Terms from './pages/Terms';

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
          <Splash />
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="confidentialite" element={<Privacy />} />
                <Route path="conditions" element={<Terms />} />
                <Route path="boutique" element={<RequireAuth><Shop /></RequireAuth>} />
                <Route path="boutique/:id" element={<RequireAuth><ProductPage /></RequireAuth>} />
                <Route path="boutique/:id/commande" element={<RequireAuth><Checkout /></RequireAuth>} />
                <Route path="commandes" element={<RequireAuth><Orders /></RequireAuth>} />
                <Route path="commandes/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
                <Route path="explorer" element={<RequireAuth><Explore /></RequireAuth>} />
                <Route path="prestataire/:id" element={<RequireAuth><ProviderPage /></RequireAuth>} />
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
