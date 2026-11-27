import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Chip, EmptyState, ErrorState, Field, Img, SectionTitle, Spinner, StatusBadge, useToast } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import type { Category, RequestStatus } from '../../lib/types';
import { AdminOrders, AdminPayouts, AdminProducts } from './AdminShop';

type Tab = 'stats' | 'orders' | 'products' | 'payouts' | 'providers' | 'portfolio' | 'users' | 'categories' | 'requests' | 'reports' | 'logs';
const TABS: [Tab, string][] = [
  ['stats', 'Statistiques'],
  ['orders', 'Commandes'],
  ['products', 'Produits'],
  ['payouts', 'Test de réception'],
  ['providers', 'Prestataires'],
  ['portfolio', 'Photos'],
  ['users', 'Utilisateurs'],
  ['categories', 'Catégories'],
  ['requests', 'Demandes'],
  ['reports', 'Signalements'],
  ['logs', 'Journal'],
];

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('stats');
  return (
    <>
      <div className="form-head">
        <Link to="/profil" className="icon-btn dark" aria-label="Retour au profil">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title tight">Administration</h1>
      </div>
      <div className="chips-row" role="tablist">
        {TABS.map(([id, label]) => (
          <Chip key={id} active={tab === id} onClick={() => setTab(id)}>
            {label}
          </Chip>
        ))}
      </div>
      {tab === 'stats' && <Stats />}
      {tab === 'orders' && <AdminOrders />}
      {tab === 'products' && <AdminProducts />}
      {tab === 'payouts' && <AdminPayouts />}
      {tab === 'providers' && <Providers />}
      {tab === 'portfolio' && <Portfolio />}
      {tab === 'users' && <Users />}
      {tab === 'categories' && <Categories />}
      {tab === 'requests' && <Requests />}
      {tab === 'reports' && <Reports />}
      {tab === 'logs' && <Logs />}
    </>
  );
}

function Load<T>({ state, children }: { state: ReturnType<typeof useAsync<T>>; children: (d: T) => React.ReactNode }) {
  if (state.loading && !state.data) return <Spinner />;
  if (state.error || !state.data) return <ErrorState message={state.error ?? 'Erreur'} onRetry={state.reload} />;
  return <>{children(state.data)}</>;
}

// ---------------------------------------------------------------- Statistiques
interface StatsData {
  users: { total: number; by_role: Record<string, number>; suspended: number };
  providers: Record<string, number>;
  requests: { total: number; by_status: Record<string, number> };
  portfolio: Record<string, number>;
  reports: Record<string, number>;
  requests_last_14_days: { date: string; count: number }[];
}
function Stats() {
  const s = useAsync(() => api.get<StatsData>('/admin/stats'), []);
  return (
    <Load state={s}>
      {(d) => {
        const max = Math.max(1, ...d.requests_last_14_days.map((x) => x.count));
        return (
          <>
            <div className="kpis">
              <div><strong>{d.users.total}</strong><span>utilisateurs</span></div>
              <div><strong>{d.providers.approved ?? 0}</strong><span>prestataires validés</span></div>
              <div><strong>{d.providers.pending ?? 0}</strong><span>à valider</span></div>
              <div><strong>{d.requests.total}</strong><span>demandes</span></div>
              <div><strong>{d.portfolio.pending ?? 0}</strong><span>photos à modérer</span></div>
              <div><strong>{d.reports.open ?? 0}</strong><span>signalements ouverts</span></div>
            </div>
            <SectionTitle>Demandes — 14 derniers jours</SectionTitle>
            <div className="bars" role="img" aria-label="Nombre de demandes par jour">
              {d.requests_last_14_days.map((x) => (
                <div key={x.date} title={`${formatDate(x.date)} : ${x.count}`}>
                  <span style={{ height: `${(x.count / max) * 100}%` }} />
                </div>
              ))}
            </div>
            <SectionTitle>Demandes par statut</SectionTitle>
            <ul className="list">
              {Object.entries(d.requests.by_status).map(([k, v]) => (
                <li key={k} className="row-between list-item">
                  <StatusBadge status={k as RequestStatus} />
                  <strong>{v}</strong>
                </li>
              ))}
              {d.requests.total === 0 && <li className="muted">Aucune demande pour le moment.</li>}
            </ul>
          </>
        );
      }}
    </Load>
  );
}

// ---------------------------------------------------------------- Prestataires
interface AdminProvider { id: string; business_name: string; city: string | null; image_url: string | null; status: string; owner: string; is_demo: boolean; bio: string | null; specialties: string[] }
function Providers() {
  const [filter, setFilter] = useState('pending');
  const s = useAsync(() => api.get<{ providers: AdminProvider[] }>(`/admin/providers?status=${filter}`), [filter]);
  const { toast } = useToast();
  const act = async (id: string, status: string) => {
    const note = status === 'rejected' || status === 'suspended' ? (prompt('Motif (visible par le prestataire) :') ?? undefined) : undefined;
    if ((status === 'rejected' || status === 'suspended') && note === undefined) return;
    try {
      await api.post(`/admin/providers/${id}/status`, { status, note: note || undefined });
      toast('Statut mis à jour.');
      s.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  return (
    <>
      <div className="chips-row">
        {['pending', 'approved', 'rejected', 'suspended'].map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {{ pending: 'À valider', approved: 'Validés', rejected: 'Refusés', suspended: 'Suspendus' }[f]}
          </Chip>
        ))}
      </div>
      <Load state={s}>
        {(d) =>
          d.providers.length === 0 ? (
            <EmptyState title="Aucun prestataire" />
          ) : (
            <ul className="list">
              {d.providers.map((p) => (
                <li key={p.id} className="list-item">
                  <div className="row-between">
                    <Link to={`/prestataire/${p.id}`}><strong>{p.business_name}</strong></Link>
                    {p.is_demo && <span className="badge badge-muted">démo</span>}
                  </div>
                  <span className="muted small">{p.owner}{p.city ? ` · ${p.city}` : ''}</span>
                  {p.bio && <p className="clamp">{p.bio}</p>}
                  <div className="row-actions">
                    {p.status !== 'approved' && <button className="btn btn-primary btn-sm" onClick={() => act(p.id, 'approved')}>Valider</button>}
                    {p.status === 'pending' && <button className="btn btn-outline btn-sm" onClick={() => act(p.id, 'rejected')}>Refuser</button>}
                    {p.status === 'approved' && <button className="btn btn-outline btn-sm danger" onClick={() => act(p.id, 'suspended')}>Suspendre</button>}
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Load>
    </>
  );
}

// ---------------------------------------------------------------- Photos
interface AdminItem { id: string; title: string; description: string | null; image_url: string | null; provider_name: string | null; moderation_status: string }
function Portfolio() {
  const [filter, setFilter] = useState('pending');
  const s = useAsync(() => api.get<{ items: AdminItem[] }>(`/admin/portfolio?status=${filter}`), [filter]);
  const { toast } = useToast();
  const moderate = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await api.post(`/admin/portfolio/${id}/moderate`, { status });
      s.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  const del = async (id: string) => {
    if (!confirm('Supprimer définitivement cette photo ?')) return;
    try {
      await api.del(`/admin/portfolio/${id}`);
      s.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  return (
    <>
      <div className="chips-row">
        {['pending', 'approved', 'rejected'].map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {{ pending: 'À modérer', approved: 'Publiées', rejected: 'Refusées' }[f]}
          </Chip>
        ))}
      </div>
      <Load state={s}>
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState title="Aucune photo" />
          ) : (
            <ul className="list">
              {d.items.map((i) => (
                <li key={i.id} className="list-item mod-item">
                  <Img src={i.image_url} alt={i.title} />
                  <div>
                    <strong>{i.title}</strong>
                    <span className="muted small">{i.provider_name}</span>
                    {i.description && <p className="clamp">{i.description}</p>}
                    <div className="row-actions">
                      {i.moderation_status !== 'approved' && <button className="btn btn-primary btn-sm" onClick={() => moderate(i.id, 'approved')}>Approuver</button>}
                      {i.moderation_status !== 'rejected' && <button className="btn btn-outline btn-sm" onClick={() => moderate(i.id, 'rejected')}>Refuser</button>}
                      <button className="btn btn-outline btn-sm danger" onClick={() => del(i.id)}>Supprimer</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Load>
    </>
  );
}

// ---------------------------------------------------------------- Utilisateurs
interface AdminUser { id: string; pi_username: string; display_name: string | null; role: string; status: string; city: string | null; is_demo: boolean }
function Users() {
  const [q, setQ] = useState('');
  const s = useAsync(() => api.get<{ users: AdminUser[] }>('/admin/users'), []);
  const { toast } = useToast();
  const toggle = async (u: AdminUser) => {
    const suspend = u.status === 'active';
    const note = suspend ? (prompt('Motif de la suspension :') ?? null) : '';
    if (note === null) return;
    try {
      await api.post(`/admin/users/${u.id}/status`, { status: suspend ? 'suspended' : 'active', note: note || undefined });
      toast(suspend ? 'Compte suspendu.' : 'Compte réactivé (le profil prestataire doit être re-validé).');
      s.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  return (
    <>
      <Field label="Rechercher">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou identifiant Pi" />
      </Field>
      <Load state={s}>
        {(d) => {
          const t = q.trim().toLowerCase();
          const rows = d.users.filter((u) => !t || u.pi_username.toLowerCase().includes(t) || (u.display_name ?? '').toLowerCase().includes(t));
          return (
            <ul className="list">
              {rows.map((u) => (
                <li key={u.id} className="list-item row-between">
                  <div>
                    <strong>{u.display_name || u.pi_username}</strong>
                    <span className="muted small"> @{u.pi_username} · {u.role}{u.is_demo ? ' · démo' : ''}</span>
                    {u.status === 'suspended' && <span className="badge badge-bad">Suspendu</span>}
                  </div>
                  {u.role !== 'admin' && (
                    <button className="btn btn-outline btn-sm" onClick={() => toggle(u)}>
                      {u.status === 'active' ? 'Suspendre' : 'Réactiver'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          );
        }}
      </Load>
    </>
  );
}

// ---------------------------------------------------------------- Catégories
function Categories() {
  const s = useAsync(() => api.get<{ categories: Category[] }>('/admin/categories'), []);
  const { toast } = useToast();
  const blank = { id: '', name: '', slug: '', description: '', image_url: '', sort_order: '100', is_active: true };
  const [f, setF] = useState(blank);
  const slugify = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const save = async () => {
    const body = {
      name: f.name.trim(),
      slug: f.slug || slugify(f.name),
      description: f.description.trim() || undefined,
      image_url: f.image_url.trim() || undefined,
      sort_order: Number(f.sort_order) || 0,
      is_active: f.is_active,
    };
    try {
      if (f.id) await api.put(`/admin/categories/${f.id}`, body);
      else await api.post('/admin/categories', body);
      setF(blank);
      s.reload();
      toast('Catégorie enregistrée.');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  const del = async (c: Category) => {
    if (!confirm(`Supprimer « ${c.name} » ?`)) return;
    try {
      await api.del(`/admin/categories/${c.id}`);
      s.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  return (
    <>
      <Load state={s}>
        {(d) => (
          <ul className="list">
            {d.categories.map((c) => (
              <li key={c.id} className="list-item">
                <div className="row-between">
                  <strong>{c.name}</strong>
                  {!c.is_active && <span className="badge badge-muted">Masquée</span>}
                </div>
                <span className="muted small">{c.slug} · ordre {c.sort_order}</span>
                <div className="row-actions">
                  <button className="btn btn-outline btn-sm" onClick={() => setF({ id: c.id, name: c.name, slug: c.slug, description: c.description ?? '', image_url: c.image_url ?? '', sort_order: String(c.sort_order), is_active: c.is_active })}>Modifier</button>
                  <button className="btn btn-outline btn-sm danger" onClick={() => del(c)}>Supprimer</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Load>
      <SectionTitle>{f.id ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</SectionTitle>
      <div className="form">
        <Field label="Nom *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: f.id ? f.slug : slugify(e.target.value) })} maxLength={80} /></Field>
        <Field label="Identifiant (slug) *" hint="Minuscules, chiffres et tirets."><input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} maxLength={60} /></Field>
        <Field label="Description"><textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={400} /></Field>
        <Field label="Image" hint="Chemin /img/… ou URL https."><input value={f.image_url} onChange={(e) => setF({ ...f, image_url: e.target.value })} maxLength={500} /></Field>
        <Field label="Ordre d’affichage"><input inputMode="numeric" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Active</label>
        <div className="row-actions">
          {f.id && <button className="btn btn-outline" onClick={() => setF(blank)}>Annuler</button>}
          <button className="btn btn-primary" onClick={save}>Enregistrer</button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Demandes
interface AdminReq { id: string; status: RequestStatus; event_type: string; event_date: string; created_at: string; provider: string | null; client: string }
function Requests() {
  const s = useAsync(() => api.get<{ requests: AdminReq[] }>('/admin/requests'), []);
  return (
    <Load state={s}>
      {(d) =>
        d.requests.length === 0 ? (
          <EmptyState title="Aucune demande" />
        ) : (
          <ul className="list">
            {d.requests.map((r) => (
              <li key={r.id}>
                <Link to={`/demandes/${r.id}`} className="req-card">
                  <div className="req-top">
                    <strong>{r.event_type}</strong>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="small">{r.client} → {r.provider}</p>
                  <p className="muted small">{formatDate(r.event_date)} · créée {formatDateTime(r.created_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )
      }
    </Load>
  );
}

// ---------------------------------------------------------------- Signalements
interface AdminReport { id: string; target_type: string; target_id: string; reason: string; details: string | null; status: string; reporter: string; created_at: string }
function Reports() {
  const [filter, setFilter] = useState('open');
  const s = useAsync(() => api.get<{ reports: AdminReport[] }>(`/admin/reports?status=${filter}`), [filter]);
  const { toast } = useToast();
  const resolve = async (id: string, status: string) => {
    try {
      await api.post(`/admin/reports/${id}/resolve`, { status });
      s.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  const link = (r: AdminReport) => (r.target_type === 'provider' ? `/prestataire/${r.target_id}` : r.target_type === 'request' ? `/demandes/${r.target_id}` : null);
  return (
    <>
      <div className="chips-row">
        {['open', 'reviewed', 'actioned', 'dismissed'].map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {{ open: 'Ouverts', reviewed: 'Examinés', actioned: 'Traités', dismissed: 'Classés' }[f]}
          </Chip>
        ))}
      </div>
      <Load state={s}>
        {(d) =>
          d.reports.length === 0 ? (
            <EmptyState title="Aucun signalement" />
          ) : (
            <ul className="list">
              {d.reports.map((r) => (
                <li key={r.id} className="list-item">
                  <strong>{r.reason}</strong>
                  <span className="muted small">{r.target_type} · par {r.reporter} · {formatDateTime(r.created_at)}</span>
                  {r.details && <p>{r.details}</p>}
                  <div className="row-actions">
                    {link(r) && <Link className="btn btn-outline btn-sm" to={link(r)!}>Voir</Link>}
                    {r.status === 'open' && (
                      <>
                        <button className="btn btn-primary btn-sm" onClick={() => resolve(r.id, 'actioned')}>Traité</button>
                        <button className="btn btn-outline btn-sm" onClick={() => resolve(r.id, 'dismissed')}>Classer</button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Load>
    </>
  );
}

// ---------------------------------------------------------------- Journal
interface AdminLog { id: string; action: string; admin: string; target_type: string | null; created_at: string }
function Logs() {
  const s = useAsync(() => api.get<{ logs: AdminLog[] }>('/admin/logs'), []);
  return (
    <Load state={s}>
      {(d) =>
        d.logs.length === 0 ? (
          <EmptyState title="Journal vide" />
        ) : (
          <ul className="list">
            {d.logs.map((l) => (
              <li key={l.id} className="list-item">
                <strong>{l.action}</strong>
                <span className="muted small">{l.admin}{l.target_type ? ` · ${l.target_type}` : ''} · {formatDateTime(l.created_at)}</span>
              </li>
            ))}
          </ul>
        )
      }
    </Load>
  );
}
