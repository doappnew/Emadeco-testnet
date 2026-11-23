import { MapPin, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { PortfolioGrid, ProviderCard } from '../components/cards';
import { Chip, EmptyState, ErrorState, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync, useDebounced } from '../lib/hooks';
import type { Category, PortfolioItem, ProviderCardData } from '../lib/types';
import { useEffect, useState } from 'react';

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const tab = params.get('tab') === 'works' ? 'works' : 'providers';
  const category = params.get('category') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [zone, setZone] = useState(params.get('zone') ?? '');
  const dq = useDebounced(q);
  const dz = useDebounced(zone);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  // Synchronise la recherche (débouncée) avec l'URL pour pouvoir partager / revenir en arrière.
  useEffect(() => {
    const next = new URLSearchParams(params);
    dq ? next.set('q', dq) : next.delete('q');
    dz ? next.set('zone', dz) : next.delete('zone');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, dz]);

  const cats = useAsync(() => api.get<{ categories: Category[] }>('/categories'), []);
  const providers = useAsync(
    () => {
      if (tab !== 'providers') return Promise.resolve({ providers: [] as ProviderCardData[] });
      const qs = new URLSearchParams();
      if (category) qs.set('category', category);
      if (dq) qs.set('q', dq);
      if (dz) qs.set('zone', dz);
      return api.get<{ providers: ProviderCardData[] }>(`/providers?${qs}`);
    },
    [tab, category, dq, dz],
  );
  const works = useAsync(
    () => (tab === 'works' ? api.get<{ items: PortfolioItem[] }>(`/portfolio${category ? `?category=${encodeURIComponent(category)}` : ''}`) : Promise.resolve({ items: [] as PortfolioItem[] })),
    [tab, category],
  );
  const favs = useAsync(
    () => (user ? api.get<{ providers: { favorite_id: string; id: string }[] }>('/favorites') : Promise.resolve({ providers: [] })),
    [user?.id],
  );
  const favMap = new Map((favs.data?.providers ?? []).map((f) => [f.id, f.favorite_id]));

  const state = tab === 'providers' ? providers : works;
  const list = tab === 'providers' ? providers.data?.providers ?? [] : works.data?.items ?? [];

  return (
    <>
      <h1 className="page-title">Explorer</h1>
      <div className="search search-light" role="search">
        <Search size={18} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Prestataire, spécialité, service…" aria-label="Rechercher" maxLength={80} />
      </div>
      <div className="search search-light">
        <MapPin size={18} aria-hidden />
        <input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Ville ou zone (ex. Cotonou)" aria-label="Localisation" maxLength={80} />
      </div>

      <div className="chips-row" role="group" aria-label="Catégories">
        <Chip active={!category} onClick={() => set('category', '')}>
          Toutes
        </Chip>
        {cats.data?.categories.map((c) => (
          <Chip key={c.id} active={category === c.slug} onClick={() => set('category', c.slug)}>
            {c.name}
          </Chip>
        ))}
      </div>

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={tab === 'providers'} className={tab === 'providers' ? 'on' : ''} onClick={() => set('tab', '')}>
          Prestataires
        </button>
        <button role="tab" aria-selected={tab === 'works'} className={tab === 'works' ? 'on' : ''} onClick={() => set('tab', 'works')}>
          Réalisations
        </button>
      </div>

      {state.loading && <Spinner />}
      {state.error && <ErrorState message={state.error} onRetry={state.reload} />}
      {!state.loading && !state.error && list.length === 0 && (
        <EmptyState title="Aucun résultat" text="Essayez une autre catégorie, une autre ville ou un autre mot-clé." />
      )}
      {!state.loading && tab === 'providers' && (
        <div className="stack">
          {providers.data?.providers.map((p) => (
            <ProviderCard key={p.id} p={p} favoriteId={favMap.get(p.id) ?? null} />
          ))}
        </div>
      )}
      {!state.loading && tab === 'works' && works.data && <PortfolioGrid items={works.data.items} showProvider />}
    </>
  );
}
