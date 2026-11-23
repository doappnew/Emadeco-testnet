import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, Spinner, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { formatDate, TAB_STATUSES, type RequestTab } from '../lib/format';
import { useAsync, usePolling } from '../lib/hooks';
import type { RequestSummary } from '../lib/types';

const TABS: { id: RequestTab; label: string }[] = [
  { id: 'progress', label: 'En cours' },
  { id: 'answers', label: 'Réponses' },
  { id: 'done', label: 'Terminées' },
];

export function RequestList({ items, as }: { items: RequestSummary[]; as: 'client' | 'provider' }) {
  return (
    <ul className="list">
      {items.map((r) => (
        <li key={r.id}>
          <Link to={`/demandes/${r.id}`} className="req-card">
            <div className="req-top">
              <strong>{r.event_type}</strong>
              <StatusBadge status={r.status} />
            </div>
            <p className="muted small">
              <CalendarDays size={13} aria-hidden /> {formatDate(r.event_date)} · <MapPin size={13} aria-hidden /> {r.event_location}
            </p>
            <p className="small">{as === 'provider' ? `Client : ${r.client?.name ?? ''}` : (r.provider?.business_name ?? '')}</p>
            <ChevronRight className="req-chev" size={18} aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Onglets « En cours / Réponses / Terminées » réutilisés côté client et côté prestataire. */
export function RequestTabs({ items, as }: { items: RequestSummary[]; as: 'client' | 'provider' }) {
  const counts = Object.fromEntries(TABS.map((t) => [t.id, items.filter((r) => TAB_STATUSES[t.id].includes(r.status)).length])) as Record<RequestTab, number>;
  const first = (TABS.find((t) => counts[t.id] > 0) ?? TABS[0]!).id;
  const [tab, setTab] = useState<RequestTab>(first);
  const shown = items.filter((r) => TAB_STATUSES[tab].includes(r.status));
  return (
    <>
      <div className="segmented" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label} {counts[t.id] > 0 && <span className="count">{counts[t.id]}</span>}
          </button>
        ))}
      </div>
      {shown.length === 0 ? <EmptyState title="Rien ici pour le moment" text="Les demandes concernées apparaîtront dans cet onglet." /> : <RequestList items={shown} as={as} />}
    </>
  );
}

export default function Requests() {
  const { data, loading, error, reload } = useAsync(() => api.get<{ requests: RequestSummary[] }>('/requests?as=client'), []);
  usePolling(reload, 30_000);

  return (
    <>
      <h1 className="page-title">Mes demandes</h1>
      {loading && !data && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data &&
        (data.requests.length === 0 ? (
          <EmptyState
            title="Aucune demande pour l’instant"
            text="Choisissez un prestataire et décrivez votre événement : il vous répondra ici."
            action={
              <Link to="/explorer" className="btn btn-primary">
                Trouver un prestataire
              </Link>
            }
          />
        ) : (
          <RequestTabs items={data.requests} as="client" />
        ))}
      {data && data.requests.length > 0 && (
        <Link to="/explorer" className="btn btn-primary btn-block cta-main">
          Nouvelle demande
        </Link>
      )}
    </>
  );
}
