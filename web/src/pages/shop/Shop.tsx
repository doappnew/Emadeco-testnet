import { useMemo } from 'react';
import { Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Chip, EmptyState, ErrorState, SectionTitle, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { groupByCategory, type Product, type ShopCategory } from '../../lib/shop';
import { norm } from '../../lib/format';
import { ProductCard } from './ProductCard';

/** Boutique : produits classés catégorie par catégorie. */
export default function Shop() {
  const [params, setParams] = useSearchParams();
  const cat = params.get('category') ?? '';
  const q = params.get('q') ?? '';
  const { data, loading, error, reload } = useAsync(() => api.get<{ categories: ShopCategory[]; products: Product[] }>('/shop/products'), []);

  const groups = useMemo(() => {
    if (!data) return [];
    const nq = norm(q);
    const list = data.products.filter((p) => !nq || norm(`${p.title} ${p.description ?? ''} ${p.category_name ?? ''}`).includes(nq));
    const cats = data.categories.filter((c) => !cat || c.slug === cat);
    return groupByCategory(cats, list);
  }, [data, cat, q]);

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };

  return (
    <>
      <h1 className="page-title">Boutique</h1>
      <p className="muted">Tous les prix sont des prix de test en Pi (réseau d’essai).</p>
      <label className="search search-light">
        <Search size={18} aria-hidden />
        <input value={q} onChange={(e) => set('q', e.target.value)} placeholder="Rechercher un produit" aria-label="Rechercher un produit" maxLength={80} />
      </label>

      {loading && !data && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          <div className="chips-row" role="group" aria-label="Catégories">
            <Chip active={!cat} onClick={() => set('category', '')}>
              Tout
            </Chip>
            {data.categories.map((c) => (
              <Chip key={c.id} active={cat === c.slug} onClick={() => set('category', c.slug)}>
                {c.name} ({c.count})
              </Chip>
            ))}
          </div>

          {groups.length === 0 && <EmptyState title="Aucun produit trouvé" text="Essayez une autre catégorie ou un autre mot." />}

          {groups.map(({ category, products }) => (
            <section key={category.id} aria-label={category.name}>
              <SectionTitle>{category.name}</SectionTitle>
              <div className="prod-grid">
                {products.map((p) => (
                  <ProductCard key={p.id} p={p} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
