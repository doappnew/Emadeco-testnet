import { useState } from 'react';
import { Award, Handshake, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { CategoryCard, ProviderCard } from '../components/cards';
import { PortfolioGrid } from '../components/cards';
import { ErrorState, SectionTitle, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import type { Category, PortfolioItem, ProviderCardData } from '../lib/types';

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
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useAsync(() => api.get<HomeData>('/home'), []);

  return (
    <>
      <section className="hero">
        <img className="hero-img" src="/img/hero.webp" alt="" fetchPriority="high" />
        <div className="hero-shade" />
        <div className="hero-content">
          <h1>Vos événements, notre passion</h1>
          <p>Des ambiances qui marquent les esprits et subliment vos moments.</p>
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              nav(`/explorer${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
            }}
          >
            <Search size={18} aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Quel service ?" aria-label="Rechercher un service" maxLength={80} />
            <button className="btn btn-gold btn-sm" type="submit">
              Chercher
            </button>
          </form>
        </div>
      </section>

      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          <SectionTitle action={<Link to="/explorer">Voir tout</Link>}>Nos services</SectionTitle>
          <div className="cat-grid">
            {data.categories.slice(0, 6).map((c) => (
              <CategoryCard key={c.id} c={c} />
            ))}
          </div>
          {data.categories.length > 6 && (
            <div className="chips-row" aria-label="Autres catégories">
              {data.categories.slice(6).map((c) => (
                <Link key={c.id} to={`/explorer?category=${c.slug}`} className="chip">
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

          <SectionTitle action={<Link to="/explorer">Tous les prestataires</Link>}>Prestataires recommandés</SectionTitle>
          {data.providers.length === 0 ? (
            <p className="muted">Les premiers prestataires arrivent bientôt.</p>
          ) : (
            <div className="stack">
              {data.providers.slice(0, 4).map((p) => (
                <ProviderCard key={p.id} p={p} />
              ))}
            </div>
          )}

          <Link to="/explorer" className="btn btn-primary btn-block cta-main">
            Demander un service
          </Link>
        </>
      )}

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
    </>
  );
}
