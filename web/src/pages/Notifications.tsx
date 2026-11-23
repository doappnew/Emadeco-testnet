import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, ErrorState, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { timeAgo } from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { NotificationItem } from '../lib/types';

export default function Notifications() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const { data, loading, error, reload } = useAsync(() => api.get<{ notifications: NotificationItem[]; unread: number }>('/notifications'), []);

  const markAll = async () => {
    await api.post('/notifications/read', {});
    await refresh();
    reload();
  };
  const open = async (n: NotificationItem) => {
    if (!n.read_at) {
      await api.post('/notifications/read', { ids: [n.id] }).catch(() => undefined);
      void refresh();
    }
    if (n.request_id) nav(`/demandes/${n.request_id}`);
    else if (n.type === 'provider_review') nav('/espace-prestataire');
  };

  return (
    <>
      <div className="row-between">
        <h1 className="page-title">Notifications</h1>
        {data && data.unread > 0 && (
          <button className="link-btn" onClick={markAll}>
            Tout marquer comme lu
          </button>
        )}
      </div>
      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.notifications.length === 0 && <EmptyState title="Aucune notification" text="Vous serez prévenu ici des réponses et des changements de statut." />}
      {data && (
        <ul className="list">
          {data.notifications.map((n) => (
            <li key={n.id}>
              <button className={`notif ${n.read_at ? '' : 'unread'}`} onClick={() => open(n)}>
                <Bell size={18} aria-hidden />
                <span>
                  <strong>{n.title}</strong>
                  {n.body && <em>{n.body}</em>}
                  <small>{timeAgo(n.created_at)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
