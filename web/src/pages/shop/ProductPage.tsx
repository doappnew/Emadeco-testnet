import { useState } from 'react';
import { ArrowLeft, Minus, Plus, ShoppingBag } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorState, Img, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { formatPi, type Product } from '../../lib/shop';

export default function ProductPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [qty, setQty] = useState(1);
  const { data, loading, error, reload } = useAsync(() => api.get<{ product: Product }>(`/shop/products/${id}`), [id]);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorState message={error ?? 'Produit introuvable.'} onRetry={reload} />;
  const p = data.product;

  return (
    <>
      <div className="cover">
        <Img src={p.image_url} alt={p.title} />
        <Link to="/boutique" className="icon-btn dark cover-back" aria-label="Retour à la boutique">
          <ArrowLeft size={22} />
        </Link>
      </div>
      {p.category_name && <p className="chips-inline">{p.category_name}</p>}
      <h1 className="page-title tight">{p.title}</h1>
      <p className="price-big">
        {formatPi(p.price_pi)} <em>prix de test</em>
      </p>
      {p.description && <p className="bio">{p.description}</p>}

      <div className="qty" role="group" aria-label="Quantité">
        <button type="button" className="icon-btn dark" onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="Moins" disabled={qty <= 1}>
          <Minus size={18} />
        </button>
        <strong aria-live="polite">{qty}</strong>
        <button type="button" className="icon-btn dark" onClick={() => setQty((n) => Math.min(50, n + 1))} aria-label="Plus" disabled={qty >= 50}>
          <Plus size={18} />
        </button>
        <span className="muted">Total : {formatPi(Math.round(p.price_pi * qty * 10000) / 10000)}</span>
      </div>

      <button className="btn btn-primary btn-block" onClick={() => nav(`/boutique/${p.id}/commande?qty=${qty}`)}>
        <ShoppingBag size={18} aria-hidden /> Acheter
      </button>
    </>
  );
}
