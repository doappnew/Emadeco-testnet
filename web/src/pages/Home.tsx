import { useState } from 'react';
import { Award, Handshake, KeyRound, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { CategoryCard, ProviderCard } from '../components/cards';
import { PortfolioGrid } from '../components/cards';
import HeroCarousel from '../components/HeroCarousel';
import { ErrorState, SectionTitle, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync } from '../lib/hooks';
import { formatPi, type Product } from '../lib/shop';
import type { Category, PortfolioItem, ProviderCardData } from '../lib/types';
import { ProductCard } from './shop/ProductCard';

interface HomeData {
  categories: Category[];
  featured: PortfolioItem[];
  providers: ProviderCardData[];
}

const VALUES = [
  { icon: Award, title: 'Excellence', text: 'Des réalisations soignées.' },
  { icon: Handshake, title: 'Professionnalisme', text: 'Des échanges sérieux et fiables.' },
  { icon: Sparkles, title: 'Innovation', text: 'Des idées créatives.' },
  { icon: ShieldCheck, title: 'Respect', text: 'Des délais et des engagements tenus.' },
];

export default function Home() {
  const { ready, user, config, loginWithPi } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async () => {
    setBusy(true);
    setError(null);
    try {
      await loginWithPi();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <HeroCarousel>
        <h1>Vos événements, notre passion</h1>
        <p>Des ambiances qui marquent les esprits et subliment vos moments.</p>
        {!ready ? null : user ? (
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              nav(`/boutique${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
            }}
          >
            <Search size={18} aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Quel produit ?" aria-label="Rechercher un produit" maxLength={80} />
            <button className="btn btn-gold btn-sm" type="submit">
              Chercher
            </button>
          </form>
        ) : (
          <div className="hero-login">
            <button className="btn btn-gold btn-block btn-lg" disabled={busy} onClick={login}>
              <KeyRound size={20} aria-hidden /> {busy ? 'Connexion en cours…' : 'Se connecter avec Pi'}
            </button>
            <p className="hero-hint">Connexion obligatoire pour accéder à la boutique et à toutes les sections.</p>
            {error && (
              <p className="notice notice-error" role="alert">
                {error}
              </p>
            )}
            {config?.demo_mode && (
              <Link to="/connexion" className="link-btn hero-demo">
                Mode démonstration
              </Link>
            )}
          </div>
        )}
      </HeroCarousel>

      {!ready && <Spinner />}
      {ready && user && <HomeContent />}

      <SectionTitle>Nos engagements</SectionTitle>
      <ul className="values">
        {VALUES.map(({ icon: Icon, title, text }) => (
          <li key={title}>
            <Icon size={22} aria-hidden />
            <strong>{title}</strong>
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <p className="legal-link">
        <Link to="/confidentialite">Politique de confidentialité</Link> · <Link to="/conditions">Conditions d’utilisation</Link>
      </p>
    </>
  );
}

/** Contenu réservé aux pionniers connectés. */
function HomeContent() {
  const home = useAsync(() => api.get<HomeData>('/home'), []);
  const shop = useAsync(() => api.get<{ products: Product[] }>('/shop/products'), []);
  const { data, loading, error, reload } = home;

  return (
    <>
      {(loading || shop.loading) && !data && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {shop.data && shop.data.products.length > 0 && (
        <>
          <SectionTitle action={<Link to="/boutique">Voir la boutique</Link>}>Boutique</SectionTitle>
          <div className="prod-strip">
            {shop.data.products.slice(0, 8).map((p) => (
              <ProductCard key={p.id} p={p} compact />
            ))}
          </div>
          <p className="muted small">Prix de test en Pi (réseau d’essai) — par exemple {formatPi(shop.data.products[0]!.price_pi)}.</p>
        </>
      )}

      {data && (
        <>
          <SectionTitle action={<Link to="/boutique">Voir tout</Link>}>Nos catégories</SectionTitle>
          <div className="cat-grid">
            {data.categories.slice(0, 6).map((c) => (
              <CategoryCard key={c.id} c={c} to={`/boutique?category=${c.slug}`} />
            ))}
          </div>
          {data.categories.length > 6 && (
            <div className="chips-row" aria-label="Autres catégories">
              {data.categories.slice(6).map((c) => (
                <Link key={c.id} to={`/boutique?category=${c.slug}`} className="chip">
                  {c.name}
                </Link>
              ))}
            </div>
          )}

          {data.featured.length > 0 && (
            <>
              <SectionTitle action={<Link to="/explorer?tab=works">Tout voir</Link>}>Réalisations à la une</SectionTitle>
              <PortfolioGrid items={data.featured.slice(0, 6)} showProvider />
            </>
          )}

          {data.providers.length > 0 && (
            <>
              <SectionTitle action={<Link to="/explorer">Tous les prestataires</Link>}>Prestataires recommandés</SectionTitle>
              <div className="stack">
                {data.providers.slice(0, 4).map((p) => (
                  <ProviderCard key={p.id} p={p} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
