import { useState, type FormEvent } from 'react';
import { Chip, EmptyState, ErrorState, Field, Img, Spinner, useToast } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import { formatPi, ORDER_TONE, type Order, type OrderStatus, type Product } from '../../lib/shop';

const PRESETS = Array.from({ length: 28 }, (_, i) => `/img/shop/p${String(i + 1).padStart(2, '0')}.webp`);

interface CatalogData {
  categories: { id: string; name: string; slug: string }[];
  products: Product[];
}

// ---------------------------------------------------------------- Produits
export function AdminProducts() {
  const state = useAsync(() => api.get<CatalogData>('/admin/shop/products'), []);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const { data, loading, error, reload } = state;

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorState message={error ?? 'Erreur'} onRetry={reload} />;

  if (editing)
    return (
      <ProductForm
        cats={data.categories}
        product={editing === 'new' ? null : editing}
        onClose={(changed) => {
          setEditing(null);
          if (changed) reload();
        }}
      />
    );

  return (
    <>
      <button className="btn btn-primary btn-block" onClick={() => setEditing('new')}>
        Ajouter un produit
      </button>
      {data.categories.map((c) => {
        const items = data.products.filter((p) => p.category_id === c.id);
        if (!items.length) return null;
        return (
          <section key={c.id}>
            <h2 className="admin-cat">{c.name}</h2>
            <ul className="list">
              {items.map((p) => (
                <li key={p.id} className="list-item admin-prod">
                  <Img src={p.image_url} alt="" className="order-thumb" />
                  <div>
                    <strong>{p.title}</strong>
                    <p className="muted">
                      {formatPi(p.price_pi)} {!p.is_active && <span className="badge badge-muted">Masqué</span>}
                    </p>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => setEditing(p)}>
                    Modifier
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {data.products.some((p) => !p.category_id) && (
        <section>
          <h2 className="admin-cat">Sans catégorie</h2>
          <ul className="list">
            {data.products
              .filter((p) => !p.category_id)
              .map((p) => (
                <li key={p.id} className="list-item admin-prod">
                  <Img src={p.image_url} alt="" className="order-thumb" />
                  <div>
                    <strong>{p.title}</strong>
                    <p className="muted">{formatPi(p.price_pi)}</p>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => setEditing(p)}>
                    Modifier
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ProductForm({ cats, product, onClose }: { cats: CatalogData['categories']; product: Product | null; onClose: (changed: boolean) => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState(product?.title ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.price_pi) : '');
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '');
  const [preset, setPreset] = useState(product?.image_path?.startsWith('/') ? product.image_path : '');
  const [file, setFile] = useState<File | null>(null);
  const [active, setActive] = useState(product?.is_active ?? true);
  const [sort, setSort] = useState(String(product?.sort_order ?? 0));
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        title,
        description: description || null,
        category_id: categoryId || null,
        price_pi: Number(price.replace(',', '.')),
        is_active: active,
        sort_order: Number(sort) || 0,
      };
      if (preset && !file) body.image_path = preset;
      const res = product
        ? await api.put<{ product: Product }>(`/admin/shop/products/${product.id}`, body)
        : await api.post<{ product: Product }>('/admin/shop/products', body);
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        await api.upload(`/admin/shop/products/${res.product.id}/image`, fd);
      }
      toast('Produit enregistré.');
      onClose(true);
    } catch (ex) {
      toast(errorMessage(ex), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!product || !window.confirm('Supprimer définitivement ce produit ? Les commandes déjà passées sont conservées.')) return;
    setBusy(true);
    try {
      await api.del(`/admin/shop/products/${product.id}`);
      toast('Produit supprimé.');
      onClose(true);
    } catch (ex) {
      toast(errorMessage(ex), 'error');
      setBusy(false);
    }
  };

  const preview = file ? URL.createObjectURL(file) : preset || product?.image_url || null;

  return (
    <form className="form" onSubmit={save}>
      <h2>{product ? 'Modifier le produit' : 'Nouveau produit'}</h2>
      <Img src={preview} alt="Aperçu" className="admin-preview" />
      <Field label="Nom du produit *">
        <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={120} />
      </Field>
      <Field label="Catégorie">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">— Aucune —</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Prix de test en Pi *" hint="Jusqu’à 4 décimales, par exemple 0.25">
        <input value={price} onChange={(e) => setPrice(e.target.value)} required inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,4})?" />
      </Field>
      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={1500} />
      </Field>
      <Field label="Photo de l’application">
        <select value={preset} onChange={(e) => setPreset(e.target.value)} disabled={!!file}>
          <option value="">— Choisir —</option>
          {PRESETS.map((p, i) => (
            <option key={p} value={p}>
              Photo {i + 1}
            </option>
          ))}
        </select>
      </Field>
      <Field label="… ou envoyer une nouvelle photo" hint="JPEG, PNG ou WebP, 5 Mo maximum.">
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      <Field label="Ordre d’affichage">
        <input value={sort} onChange={(e) => setSort(e.target.value)} inputMode="numeric" pattern="[0-9]{1,6}" />
      </Field>
      <label className="check">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Visible dans la boutique
      </label>
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button className="btn btn-outline" type="button" disabled={busy} onClick={() => onClose(false)}>
          Annuler
        </button>
        {product && (
          <button className="btn btn-outline danger" type="button" disabled={busy} onClick={remove}>
            Supprimer
          </button>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Commandes
interface Summary {
  by_status: Record<string, number>;
  paid_total_pi: number;
  products: number;
}
const FILTERS: [string, string][] = [
  ['', 'Toutes'],
  ['paid', 'À servir'],
  ['preparing', 'En préparation'],
  ['delivered', 'Livrées'],
  ['awaiting_payment', 'Non payées'],
  ['cancelled', 'Annulées'],
];
const ACTIONS: Record<OrderStatus, [OrderStatus, string][]> = {
  awaiting_payment: [['cancelled', 'Annuler']],
  paid: [
    ['preparing', 'Préparer'],
    ['delivered', 'Marquer livrée'],
    ['cancelled', 'Annuler'],
  ],
  preparing: [
    ['delivered', 'Marquer livrée'],
    ['cancelled', 'Annuler'],
  ],
  delivered: [],
  cancelled: [],
};

export function AdminOrders() {
  const [status, setStatus] = useState('');
  const { toast } = useToast();
  const summary = useAsync(() => api.get<Summary>('/admin/shop/summary'), []);
  const list = useAsync(() => api.get<{ orders: Order[] }>(`/admin/shop/orders${status ? `?status=${status}` : ''}`), [status]);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (o: Order, next: OrderStatus) => {
    if (next === 'cancelled' && !window.confirm('Annuler cette commande ? Un remboursement éventuel se fait hors de l’application.')) return;
    setBusy(o.id);
    try {
      await api.patch(`/admin/shop/orders/${o.id}`, { status: next, ...(note[o.id] ? { admin_note: note[o.id] } : {}) });
      toast('Commande mise à jour.');
      list.reload();
      summary.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const s = summary.data;
  return (
    <>
      {s && (
        <div className="kpis">
          <div><strong>{s.by_status.paid ?? 0}</strong><span>à servir</span></div>
          <div><strong>{s.by_status.preparing ?? 0}</strong><span>en préparation</span></div>
          <div><strong>{s.by_status.delivered ?? 0}</strong><span>livrées</span></div>
          <div><strong>{formatPi(s.paid_total_pi)}</strong><span>encaissé (test)</span></div>
        </div>
      )}
      <div className="chips-row">
        {FILTERS.map(([id, label]) => (
          <Chip key={id} active={status === id} onClick={() => setStatus(id)}>
            {label}
          </Chip>
        ))}
      </div>
      {list.loading && !list.data && <Spinner />}
      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {list.data && list.data.orders.length === 0 && <EmptyState title="Aucune commande" />}
      <ul className="list">
        {list.data?.orders.map((o) => (
          <li key={o.id} className="list-item order-admin">
            <div className="req-top">
              <strong>{o.product_title}</strong>
              <span className={`badge badge-${ORDER_TONE[o.status]}`}>{o.status_label}</span>
            </div>
            <p>
              {o.quantity} × {formatPi(o.unit_price_pi)} = <strong>{formatPi(o.total_pi)}</strong>
            </p>
            <p className="muted">
              Client : {o.client_name} · {formatDateTime(o.created_at)}
            </p>
            <p>
              <strong>Livrer à :</strong> {o.recipient_name}, {o.phone}
              <br />
              {o.address}, {o.city}, {o.country}
              {o.landmark ? ` (repère : ${o.landmark})` : ''}
            </p>
            {o.notes && <p className="muted">Précisions : {o.notes}</p>}
            {o.pi_txid && <p className="muted small">Transaction : {o.pi_txid.slice(0, 16)}…</p>}
            {ACTIONS[o.status].length > 0 && (
              <>
                <input
                  className="note-input"
                  placeholder="Message au client (facultatif)"
                  maxLength={500}
                  value={note[o.id] ?? ''}
                  onChange={(e) => setNote((n) => ({ ...n, [o.id]: e.target.value }))}
                />
                <div className="actions">
                  {ACTIONS[o.status].map(([next, label]) => (
                    <button key={next} className={`btn btn-sm ${next === 'cancelled' ? 'btn-outline danger' : 'btn-primary'}`} disabled={busy === o.id} onClick={() => act(o, next)}>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------- Pionniers (test Testnet)
export function AdminPioneers() {
  const { data, loading, error, reload } = useAsync(
    () => api.get<{ count: number; max: number; pioneers: { pi_username: string; validated_at: string }[] }>('/admin/pioneers'),
    [],
  );
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorState message={error ?? 'Erreur'} onRetry={reload} />;
  return (
    <>
      <p className="pioneer-count">
        Pionniers validés : {data.count} / {data.max}
      </p>
      {data.pioneers.length === 0 ? (
        <EmptyState title="Aucun pionnier validé" text="Un pionnier est validé quand son paiement de test est vérifié par le serveur." />
      ) : (
        <ul className="list">
          {data.pioneers.map((p) => (
            <li key={p.pi_username} className="row">
              <strong>@{p.pi_username}</strong>
              <span className="muted small">{formatDateTime(p.validated_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
