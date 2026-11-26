import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, Img, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import { formatPi, ORDER_TONE, type Order } from '../../lib/shop';

export default function Orders() {
  const { data, loading, error, reload } = useAsync(() => api.get<{ orders: Order[] }>('/shop/orders'), []);
  return (
    <>
      <h1 className="page-title">Mes commandes</h1>
      {loading && !data && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.orders.length === 0 && (
        <EmptyState title="Aucune commande" text="Vos achats apparaîtront ici." action={<Link to="/boutique" className="btn btn-primary">Voir la boutique</Link>} />
      )}
      {data && data.orders.length > 0 && (
        <ul className="list">
          {data.orders.map((o) => (
            <li key={o.id}>
              <Link to={`/commandes/${o.id}`} className="req-card order-card">
                <Img src={o.product_image_url} alt="" className="order-thumb" />
                <div>
                  <div className="req-top">
                    <strong>{o.product_title}</strong>
                  </div>
                  <p className="muted">
                    {o.quantity} × · {formatPi(o.total_pi)} · {formatDate(o.created_at)}
                  </p>
                  <span className={`badge badge-${ORDER_TONE[o.status]}`}>{o.status_label}</span>
                </div>
                <ChevronRight className="req-chev" size={20} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
