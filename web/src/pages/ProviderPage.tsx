import { MapPin } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { FavoriteButton, PortfolioGrid } from '../components/cards';
import ReportButton from '../components/ReportButton';
import { ErrorState, Img, SectionTitle, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import type { PortfolioItem, ProviderCardData, ServiceItem } from '../lib/types';

interface Detail {
  provider: ProviderCardData;
  services: ServiceItem[];
  portfolio: PortfolioItem[];
  favorite_id: string | null;
  is_own: boolean;
}

export default function ProviderPage() {
  const { id } = useParams();
  const { data, loading, error, reload } = useAsync(() => api.get<Detail>(`/providers/${id}`), [id]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState message={error ?? 'Prestataire introuvable.'} onRetry={reload} />;
  const { provider: p, services, portfolio, favorite_id, is_own } = data;
  const pending = p.status !== 'approved';

  return (
    <>
      <div className="cover">
        <Img src={p.image_url} alt="" />
        <div className="cover-fav">
          <FavoriteButton target={{ provider_id: p.id }} favoriteId={favorite_id} />
        </div>
      </div>
      <h1 className="page-title">{p.business_name}</h1>
      {p.city && (
        <p className="muted">
          <MapPin size={14} aria-hidden /> {p.city}
        </p>
      )}
      {pending && <p className="notice">Ce profil n’est pas encore public (statut : {p.status === 'pending' ? 'en validation' : p.status}).</p>}
      {p.bio && <p className="bio">{p.bio}</p>}

      {p.specialties.length > 0 && (
        <>
          <SectionTitle>Spécialités</SectionTitle>
          <div className="chips-row wrap">
            {p.specialties.map((s) => (
              <span key={s} className="chip chip-static">
                {s}
              </span>
            ))}
          </div>
        </>
      )}

      {p.service_zones.length > 0 && (
        <>
          <SectionTitle>Zones desservies</SectionTitle>
          <p>{p.service_zones.join(' · ')}</p>
        </>
      )}

      {services.length > 0 && (
        <>
          <SectionTitle>Services</SectionTitle>
          <ul className="list">
            {services.map((s) => (
              <li key={s.id} className="list-item">
                <strong>{s.title}</strong>
                {s.category_name && <span className="muted small">{s.category_name}</span>}
                {s.description && <p>{s.description}</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionTitle>Réalisations</SectionTitle>
      {portfolio.length === 0 ? <p className="muted">Aucune réalisation publiée pour le moment.</p> : <PortfolioGrid items={portfolio} />}

      {!is_own && (
        <div className="report-row">
          <ReportButton targetType="provider" targetId={p.id} />
        </div>
      )}

      {!is_own && !pending && (
        <div className="sticky-cta">
          <Link to={`/demande/nouvelle?provider=${p.id}`} className="btn btn-primary btn-block">
            Demander une prestation
          </Link>
        </div>
      )}
    </>
  );
}
