import { Link } from 'react-router-dom';
import { Img } from '../../components/ui';
import { formatPi, type Product } from '../../lib/shop';

export function ProductCard({ p, compact }: { p: Product; compact?: boolean }) {
  return (
    <Link to={`/boutique/${p.id}`} className={`prod-card ${compact ? 'prod-card-compact' : ''}`}>
      <Img src={p.image_url} alt={p.title} className="prod-img" />
      <div className="prod-body">
        <strong>{p.title}</strong>
        <span className="prod-price">{formatPi(p.price_pi)}</span>
        {!compact && <em className="prod-test">prix de test</em>}
      </div>
    </Link>
  );
}
