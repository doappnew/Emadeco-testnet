import { useState, type ChangeEvent } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Chip, EmptyState, ErrorState, Field, Img, SectionTitle, Spinner, useToast } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { splitList } from '../../lib/format';
import { useAsync, usePolling } from '../../lib/hooks';
import type { Category, PortfolioItem, RequestSummary, ServiceItem } from '../../lib/types';
import { RequestTabs } from '../Requests';

interface Me {
  provider: {
    id: string;
    business_name: string;
    bio: string | null;
    specialties: string[];
    service_zones: string[];
    city: string | null;
    status: 'pending' | 'approved' | 'rejected' | 'suspended';
  };
  services: ServiceItem[];
  portfolio: PortfolioItem[];
  stats: { requests_total: number; requests_open: number };
}

type Tab = 'requests' | 'profile' | 'services' | 'portfolio';

const BANNERS: Record<string, { tone: string; text: string }> = {
  pending: { tone: 'warn', text: 'Votre profil est en cours de validation. Il sera visible des clients dès qu’un administrateur l’aura approuvé.' },
  rejected: { tone: 'bad', text: 'Votre profil doit être complété. Corrigez-le puis enregistrez : il repartira en validation.' },
  suspended: { tone: 'bad', text: 'Votre profil est suspendu. Contactez l’équipe EMADECO.' },
};

export default function ProviderDashboard() {
  const { refresh } = useAuth();
  const [tab, setTab] = useState<Tab>('requests');
  const me = useAsync(() => api.get<Me>('/provider/me'), []);
  const reqs = useAsync(() => api.get<{ requests: RequestSummary[] }>('/requests?as=provider'), []);
  usePolling(reqs.reload, 30_000, tab === 'requests');
  const cats = useAsync(() => api.get<{ categories: Category[] }>('/categories'), []);

  if (me.loading && !me.data) return <Spinner />;
  if (me.error || !me.data) return <ErrorState message={me.error ?? 'Profil introuvable.'} onRetry={me.reload} />;
  const { provider: p } = me.data;
  const banner = BANNERS[p.status];
  const reloadAll = () => {
    me.reload();
    void refresh();
  };

  return (
    <>
      <h1 className="page-title">{p.business_name}</h1>
      {banner && <p className={`notice notice-${banner.tone}`}>{banner.text}</p>}
      <div className="stats-row">
        <div>
          <strong>{me.data.stats.requests_open}</strong>
          <span>en cours</span>
        </div>
        <div>
          <strong>{me.data.stats.requests_total}</strong>
          <span>au total</span>
        </div>
        <div>
          <strong>{me.data.portfolio.filter((i) => i.moderation_status === 'approved').length}</strong>
          <span>photos publiées</span>
        </div>
      </div>

      <div className="chips-row" role="tablist">
        {(
          [
            ['requests', 'Demandes'],
            ['profile', 'Profil'],
            ['services', 'Services'],
            ['portfolio', 'Réalisations'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <Chip key={id} active={tab === id} onClick={() => setTab(id)}>
            {label}
          </Chip>
        ))}
      </div>

      {tab === 'requests' && (
        <>
          {reqs.loading && !reqs.data && <Spinner />}
          {reqs.error && <ErrorState message={reqs.error} onRetry={reqs.reload} />}
          {reqs.data && (reqs.data.requests.length === 0 ? <EmptyState title="Aucune demande reçue" text="Les demandes des clients apparaîtront ici." /> : <RequestTabs items={reqs.data.requests} as="provider" />)}
        </>
      )}
      {tab === 'profile' && <ProfileForm me={me.data} onSaved={reloadAll} />}
      {tab === 'services' && <ServicesTab services={me.data.services} categories={cats.data?.categories ?? []} onChange={reloadAll} />}
      {tab === 'portfolio' && <PortfolioTab items={me.data.portfolio} categories={cats.data?.categories ?? []} onChange={reloadAll} />}
    </>
  );
}

function ProfileForm({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const { toast } = useToast();
  const p = me.provider;
  const [f, setF] = useState({ business_name: p.business_name, bio: p.bio ?? '', specialties: p.specialties.join(', '), zones: p.service_zones.join(', '), city: p.city ?? '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.put('/provider/me', {
        business_name: f.business_name.trim(),
        bio: f.bio.trim() || undefined,
        specialties: splitList(f.specialties, 12),
        service_zones: splitList(f.zones, 20),
        city: f.city.trim() || undefined,
      });
      toast('Profil enregistré.');
      onSaved();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="form">
      <Field label="Nom de l’activité">
        <input value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} maxLength={100} />
      </Field>
      <Field label="Présentation">
        <textarea rows={5} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} maxLength={2000} />
      </Field>
      <Field label="Spécialités" hint="Séparées par des virgules.">
        <input value={f.specialties} onChange={(e) => setF({ ...f, specialties: e.target.value })} />
      </Field>
      <Field label="Zones desservies" hint="Villes séparées par des virgules.">
        <input value={f.zones} onChange={(e) => setF({ ...f, zones: e.target.value })} />
      </Field>
      <Field label="Ville principale">
        <input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} maxLength={80} />
      </Field>
      <button className="btn btn-primary" disabled={busy} onClick={save}>
        Enregistrer
      </button>
    </div>
  );
}

function ServicesTab({ services, categories, onChange }: { services: ServiceItem[]; categories: Category[]; onChange: () => void }) {
  const { toast } = useToast();
  const empty = { id: '', category_id: '', title: '', description: '', is_active: true };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!f.category_id || f.title.trim().length < 2) return toast('Choisissez une catégorie et un titre.', 'error');
    setBusy(true);
    try {
      const body = { category_id: f.category_id, title: f.title.trim(), description: f.description.trim() || undefined, is_active: f.is_active };
      if (f.id) await api.put(`/provider/services/${f.id}`, body);
      else await api.post('/provider/services', body);
      setF(empty);
      toast('Service enregistré.');
      onChange();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    if (!confirm('Supprimer ce service ?')) return;
    try {
      await api.del(`/provider/services/${id}`);
      onChange();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <>
      <ul className="list">
        {services.map((s) => (
          <li key={s.id} className="list-item">
            <div className="row-between">
              <strong>{s.title}</strong>
              {!s.is_active && <span className="badge badge-muted">Masqué</span>}
            </div>
            <span className="muted small">{categories.find((c) => c.id === s.category_id)?.name}</span>
            {s.description && <p>{s.description}</p>}
            <div className="row-actions">
              <button className="btn btn-outline btn-sm" onClick={() => setF({ id: s.id, category_id: s.category_id, title: s.title, description: s.description ?? '', is_active: s.is_active })}>
                Modifier
              </button>
              <button className="btn btn-outline btn-sm danger" onClick={() => remove(s.id)}>
                <Trash2 size={14} aria-hidden /> Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>
      {services.length === 0 && <EmptyState title="Aucun service" text="Décrivez les prestations que vous proposez." />}

      <SectionTitle>{f.id ? 'Modifier le service' : 'Ajouter un service'}</SectionTitle>
      <div className="form">
        <Field label="Catégorie *">
          <select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
            <option value="">Sélectionnez…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Titre *">
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={120} />
        </Field>
        <Field label="Description">
          <textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1500} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Visible par les clients
        </label>
        <div className="row-actions">
          {f.id && (
            <button className="btn btn-outline" onClick={() => setF(empty)}>
              Annuler
            </button>
          )}
          <button className="btn btn-primary" disabled={busy} onClick={save}>
            {f.id ? 'Mettre à jour' : 'Ajouter'}
          </button>
        </div>
      </div>
    </>
  );
}

const MODERATION: Record<string, string> = { pending: 'En attente de modération', approved: 'Publiée', rejected: 'Refusée' };

function PortfolioTab({ items, categories, onChange }: { items: PortfolioItem[]; categories: Category[]; onChange: () => void }) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files?.[0] ?? null;
    if (!fl) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(fl.type)) return toast('Format non accepté (JPEG, PNG ou WebP).', 'error');
    if (fl.size > 5 * 1024 * 1024) return toast('Image trop lourde (5 Mo maximum).', 'error');
    setFile(fl);
  };

  const upload = async () => {
    if (!file || title.trim().length < 2) return toast('Choisissez une photo et un titre.', 'error');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title.trim());
      if (description.trim()) fd.append('description', description.trim());
      if (category) fd.append('category_id', category);
      await api.upload('/provider/portfolio', fd);
      setFile(null);
      setTitle('');
      setDescription('');
      toast('Photo envoyée : elle sera publiée après modération.');
      onChange();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    if (!confirm('Supprimer cette réalisation ?')) return;
    try {
      await api.del(`/provider/portfolio/${id}`);
      onChange();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <>
      <div className="form">
        <label className="thumb-add wide">
          <ImagePlus size={22} aria-hidden />
          <span>{file ? file.name : 'Choisir une photo'}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
        </label>
        <Field label="Titre *">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Description">
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        </Field>
        <Field label="Catégorie">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <button className="btn btn-primary" disabled={busy || !file} onClick={upload}>
          {busy ? 'Envoi…' : 'Publier la réalisation'}
        </button>
      </div>

      <SectionTitle>Mes réalisations</SectionTitle>
      {items.length === 0 && <EmptyState title="Aucune réalisation" text="Ajoutez vos plus belles photos." />}
      <ul className="grid-photos">
        {items.map((it) => (
          <li key={it.id} className="photo-owned">
            <Img src={it.image_url} alt={it.title} />
            <span className="photo-cap">{it.title}</span>
            <span className={`badge badge-${it.moderation_status === 'approved' ? 'ok' : it.moderation_status === 'rejected' ? 'bad' : 'warn'} photo-badge`}>{MODERATION[it.moderation_status ?? 'pending']}</span>
            <button className="photo-del" onClick={() => remove(it.id)} aria-label={`Supprimer ${it.title}`}>
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
