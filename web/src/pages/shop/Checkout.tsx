import { useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ErrorState, Field, Img, Spinner, useToast } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAsync } from '../../lib/hooks';
import { formatPi, payOrder, type Delivery, type Order, type Product } from '../../lib/shop';

const EMPTY: Delivery = { recipient_name: '', phone: '', country: 'Bénin', city: '', address: '', landmark: '', notes: '' };

/** Commande : informations de livraison d'abord, paiement Pi ensuite. */
export default function Checkout() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const { user, config } = useAuth();
  const qty = Math.min(50, Math.max(1, Number(params.get('qty')) || 1));
  const { data, loading, error, reload } = useAsync(() => api.get<{ product: Product }>(`/shop/products/${id}`), [id]);
  const [f, setF] = useState<Delivery>({ ...EMPTY, recipient_name: user?.display_name ?? '', city: user?.city ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorState message={error ?? 'Produit introuvable.'} onRetry={reload} />;
  const p = data.product;
  const total = Math.round(p.price_pi * qty * 10000) / 10000;
  const on = (k: keyof Delivery) => (e: { target: { value: string } }) => setF((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    let order: Order | null = null;
    try {
      const body = {
        product_id: p.id,
        quantity: qty,
        delivery: { ...f, landmark: f.landmark || undefined, notes: f.notes || undefined },
      };
      order = (await api.post<{ order: Order }>('/shop/orders', body)).order;
      const result = await payOrder(order, config?.pi_sandbox ?? false);
      if (result === 'paid') toast('Paiement reçu. Merci !');
      else toast('Paiement annulé. Vous pouvez le reprendre depuis votre commande.', 'error');
      nav(`/commandes/${order.id}`, { replace: true });
    } catch (ex) {
      const msg = ex instanceof Error && !('status' in ex) ? ex.message : errorMessage(ex);
      if (order) {
        toast(`Paiement non terminé : ${msg}`, 'error');
        nav(`/commandes/${order.id}`, { replace: true });
      } else setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="form-head">
        <Link to={`/boutique/${p.id}`} className="icon-btn dark" aria-label="Retour au produit">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title tight">Ma commande</h1>
      </div>

      <div className="order-line">
        <Img src={p.image_url} alt="" className="order-thumb" />
        <div>
          <strong>{p.title}</strong>
          <p className="muted">
            {qty} × {formatPi(p.price_pi)} <em>(prix de test)</em>
          </p>
          <p className="price-big sm">{formatPi(total)}</p>
        </div>
      </div>

      <form className="form" onSubmit={submit}>
        <h2>Informations de livraison</h2>
        <Field label="Nom et prénom du destinataire *">
          <input value={f.recipient_name} onChange={on('recipient_name')} required minLength={2} maxLength={80} autoComplete="name" />
        </Field>
        <Field label="Téléphone *" hint="Pour vous joindre à la livraison.">
          <input value={f.phone} onChange={on('phone')} required inputMode="tel" pattern="[+0-9 ()\-]{6,30}" maxLength={30} autoComplete="tel" />
        </Field>
        <Field label="Pays *">
          <input value={f.country} onChange={on('country')} required minLength={2} maxLength={60} autoComplete="country-name" />
        </Field>
        <Field label="Ville *">
          <input value={f.city} onChange={on('city')} required minLength={2} maxLength={80} autoComplete="address-level2" />
        </Field>
        <Field label="Adresse / quartier où vous habitez *">
          <textarea value={f.address} onChange={on('address')} required minLength={5} maxLength={200} rows={3} />
        </Field>
        <Field label="Point de repère">
          <input value={f.landmark} onChange={on('landmark')} maxLength={150} placeholder="Près de…" />
        </Field>
        <Field label="Précisions pour l’administrateur">
          <textarea value={f.notes} onChange={on('notes')} maxLength={500} rows={2} />
        </Field>

        {err && (
          <p className="notice notice-error" role="alert">
            {err}
          </p>
        )}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Paiement en cours…' : `Payer ${formatPi(total)} avec Pi`}
        </button>
        <p className="muted small">Paiement en Pi sur le réseau d’essai ({config?.pi_network ?? 'testnet'}). À utiliser dans Pi Browser. Le montant est vérifié par le serveur.</p>
      </form>
    </>
  );
}
