import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState, Img, Spinner, useToast } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import { formatPi, ORDER_TONE, payOrder, type Order } from '../../lib/shop';

export default function OrderDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const { config } = useAuth();
  const { data, loading, error, reload } = useAsync(() => api.get<{ order: Order }>(`/shop/orders/${id}`), [id]);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorState message={error ?? 'Commande introuvable.'} onRetry={reload} />;
  const o = data.order;

  const pay = async () => {
    setBusy(true);
    try {
      const r = await payOrder(o, config?.pi_sandbox ?? false);
      toast(r === 'paid' ? 'Paiement reçu. Merci !' : 'Paiement annulé.', r === 'paid' ? 'ok' : 'error');
    } catch (e) {
      toast(e instanceof Error && !('status' in e) ? e.message : errorMessage(e), 'error');
    } finally {
      setBusy(false);
      reload();
    }
  };
  const cancel = async () => {
    setBusy(true);
    try {
      await api.post(`/shop/orders/${o.id}/cancel`);
      toast('Commande annulée.');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
      reload();
    }
  };

  return (
    <>
      <div className="form-head">
        <Link to="/commandes" className="icon-btn dark" aria-label="Retour aux commandes">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title tight">Commande</h1>
      </div>
      <div className="order-line">
        <Img src={o.product_image_url} alt="" className="order-thumb" />
        <div>
          <strong>{o.product_title}</strong>
          <p className="muted">
            {o.quantity} × {formatPi(o.unit_price_pi)}
          </p>
          <p className="price-big sm">{formatPi(o.total_pi)}</p>
          <span className={`badge badge-${ORDER_TONE[o.status]}`}>{o.status_label}</span>
        </div>
      </div>
      {o.admin_note && <p className="notice">Message de l’administrateur : {o.admin_note}</p>}

      <dl className="recap-list">
        <dt>Destinataire</dt>
        <dd>{o.recipient_name}</dd>
        <dt>Téléphone</dt>
        <dd>{o.phone}</dd>
        <dt>Adresse</dt>
        <dd>
          {o.address}, {o.city}, {o.country}
        </dd>
        {o.landmark && (
          <>
            <dt>Repère</dt>
            <dd>{o.landmark}</dd>
          </>
        )}
        <dt>Commandée le</dt>
        <dd>{formatDateTime(o.created_at)}</dd>
        {o.paid_at && (
          <>
            <dt>Payée le</dt>
            <dd>{formatDateTime(o.paid_at)}</dd>
          </>
        )}
      </dl>

      {o.status === 'awaiting_payment' && (
        <div className="actions">
          <button className="btn btn-primary" disabled={busy} onClick={pay}>
            {busy ? 'Un instant…' : `Payer ${formatPi(o.total_pi)} avec Pi`}
          </button>
          <button className="btn btn-outline danger" disabled={busy} onClick={cancel}>
            Annuler la commande
          </button>
        </div>
      )}
    </>
  );
}
