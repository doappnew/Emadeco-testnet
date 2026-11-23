import { Link } from 'react-router-dom';
import { PortfolioGrid, ProviderCard } from '../components/cards';
import { EmptyState, ErrorState, SectionTitle, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import type { PortfolioItem, ProviderCardData } from '../lib/types';

interface Data {
  providers: (ProviderCardData & { favorite_id: string })[];
  items: (PortfolioItem & { favorite_id: string })[];
}

export default function Favorites() {
  const { data, loading, error, reload } = useAsync(() => api.get<Data>('/favorites'), []);
  return (
    <>
      <h1 className="page-title">Mes favoris</h1>
      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.providers.length === 0 && data.items.length === 0 && (
        <EmptyState
          title="Aucun favori"
          text="Touchez le cœur sur un prestataire ou une réalisation pour le retrouver ici."
          action={
            <Link to="/explorer" className="btn btn-primary">
              Explorer
            </Link>
          }
        />
      )}
      {data && data.providers.length > 0 && (
        <>
          <SectionTitle>Prestataires</SectionTitle>
          <div className="stack">
            {data.providers.map((p) => (
              <ProviderCard key={p.favorite_id} p={p} favoriteId={p.favorite_id} onFavoriteChange={reload} />
            ))}
          </div>
        </>
      )}
      {data && data.items.length > 0 && (
        <>
          <SectionTitle>Réalisations</SectionTitle>
          <PortfolioGrid items={data.items} showProvider />
        </>
      )}
    </>
  );
}
