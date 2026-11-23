import { useEffect, useState } from 'react';
import { Heart, MapPin, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Category, PortfolioItem, ProviderCardData } from '../lib/types';
import { Img, useToast } from './ui';

export function CategoryCard({ c }: { c: Category }) {
  return (
    <Link to={`/explorer?category=${encodeURIComponent(c.slug)}`} className="cat-card">
      <Img src={c.image_url} alt="" />
      <span>{c.name}</span>
    </Link>
  );
}

export function ProviderCard({ p, favoriteId, onFavoriteChange }: { p: ProviderCardData; favoriteId?: string | null; onFavoriteChange?: () => void }) {
  return (
    <article className="prov-card">
      <Link to={`/prestataire/${p.id}`} className="prov-card-link">
        <Img src={p.image_url} alt="" className="prov-card-img" />
        <div className="prov-card-body">
          <h3>{p.business_name}</h3>
          {p.city && (
            <p className="muted small">
              <MapPin size={13} aria-hidden /> {p.city}
            </p>
          )}
          <p className="chips-inline">{(p.category_names.length ? p.category_names : p.specialties).slice(0, 2).join(' · ')}</p>
        </div>
      </Link>
      <FavoriteButton target={{ provider_id: p.id }} favoriteId={favoriteId} onChange={onFavoriteChange} />
    </article>
  );
}

export function FavoriteButton({
  target,
  favoriteId,
  onChange,
}: {
  target: { provider_id: string } | { portfolio_item_id: string };
  favoriteId?: string | null;
  onChange?: () => void;
}) {
  const { user } = useAuth();
  const nav = useNavigate();
  const { toast } = useToast();
  const [fav, setFav] = useState<string | null>(favoriteId ?? null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setFav(favoriteId ?? null), [favoriteId]);

  const toggle = async () => {
    if (!user) return nav('/connexion?next=' + encodeURIComponent(location.pathname + location.search));
    setBusy(true);
    try {
      if (fav) {
        await api.del(`/favorites/${fav}`);
        setFav(null);
      } else {
        const r = await api.post<{ favorite_id: string }>('/favorites', target);
        setFav(r.favorite_id);
      }
      onChange?.();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className={`fav-btn ${fav ? 'fav-on' : ''}`} onClick={toggle} disabled={busy} aria-pressed={Boolean(fav)} aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
      <Heart size={20} fill={fav ? 'currentColor' : 'none'} />
    </button>
  );
}

/** Grille de réalisations avec visionneuse plein écran. */
export function PortfolioGrid({ items, showProvider }: { items: PortfolioItem[]; showProvider?: boolean }) {
  const [open, setOpen] = useState<PortfolioItem | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <ul className="grid-photos">
        {items.map((it) => (
          <li key={it.id}>
            <button className="photo-btn" onClick={() => setOpen(it)} aria-label={`Agrandir : ${it.title}`}>
              <Img src={it.image_url} alt={it.title} />
              <span className="photo-cap">{it.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={open.title} onClick={() => setOpen(null)}>
          <button className="lightbox-close icon-btn" aria-label="Fermer" onClick={() => setOpen(null)}>
            <X size={24} />
          </button>
          <Img src={open.image_url} alt={open.title} />
          <div className="lightbox-cap" onClick={(e) => e.stopPropagation()}>
            <strong>{open.title}</strong>
            {open.description && <p>{open.description}</p>}
            {showProvider && open.provider_id && (
              <Link to={`/prestataire/${open.provider_id}`} className="btn btn-gold btn-sm">
                Voir {open.provider_name ?? 'le prestataire'}
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
