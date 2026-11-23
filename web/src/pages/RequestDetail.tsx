import { useState } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReportButton from '../components/ReportButton';
import { ErrorState, Field, SectionTitle, Spinner, StatusBadge, useToast } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { ACTION_LABELS, formatDate, formatDateTime, STATUS_LABELS } from '../lib/format';
import { useAsync, usePolling } from '../lib/hooks';
import type { Message, RequestDetail as Detail, RequestStatus } from '../lib/types';

interface Response {
  request: Detail;
  actor: 'client' | 'provider' | 'admin';
  next_statuses: { status: RequestStatus; label: string }[];
  messages: Message[];
}

const FLOW: RequestStatus[] = ['sent', 'in_review', 'response_received', 'confirmed'];

export default function RequestDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const { data, loading, error, reload } = useAsync(() => api.get<Response>(`/requests/${id}`), [id]);
  usePolling(reload, 20_000, Boolean(data) && data!.request.status !== 'closed');

  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<RequestStatus | null>(null);
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorState message={error ?? 'Demande introuvable.'} onRetry={reload} />;
  const { request: r, actor, next_statuses, messages } = data;

  const sendMessage = async () => {
    if (!msg.trim()) return;
    setSending(true);
    try {
      await api.post(`/requests/${id}/messages`, { body: msg.trim() });
      setMsg('');
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (status: RequestStatus, withNote?: string) => {
    setActing(true);
    try {
      await api.post(`/requests/${id}/status`, { status, note: withNote?.trim() || undefined });
      toast(`Statut : ${STATUS_LABELS[status]}`);
      setPending(null);
      setNote('');
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setActing(false);
    }
  };

  // Le client répond à une demande de précisions en écrivant un message (passage automatique à « Réponse reçue »).
  const actions = next_statuses.filter((s) => !(actor === 'client' && s.status === 'response_received'));
  const needsNote = (s: RequestStatus) => actor === 'provider' && s === 'info_requested';
  const idx = FLOW.indexOf(r.status === 'info_requested' ? 'in_review' : r.status);

  return (
    <>
      <div className="form-head">
        <button className="icon-btn dark" onClick={() => nav(-1)} aria-label="Retour">
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="page-title tight">{r.event_type}</h1>
          <p className="muted small">{formatDate(r.event_date)}</p>
        </div>
      </div>

      <div className="status-box">
        <StatusBadge status={r.status} />
        {r.status_note && <p>{r.status_note}</p>}
        {!['declined', 'closed'].includes(r.status) && (
          <ol className="flow" aria-label="Progression">
            {FLOW.map((s, i) => (
              <li key={s} className={i <= idx ? 'done' : ''}>
                {STATUS_LABELS[s]}
              </li>
            ))}
          </ol>
        )}
      </div>

      {actions.length > 0 && (
        <div className="actions">
          {actions.map((a) => (
            <button
              key={a.status}
              className={`btn ${a.status === 'confirmed' || a.status === 'in_review' ? 'btn-primary' : 'btn-outline'} btn-sm`}
              disabled={acting}
              onClick={() => (needsNote(a.status) || (actor === 'provider' && a.status === 'declined') ? setPending(a.status) : changeStatus(a.status))}
            >
              {ACTION_LABELS[actor][a.status] ?? a.label}
            </button>
          ))}
        </div>
      )}
      {pending && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Ajouter une note">
          <div className="sheet-body">
            <h3>{pending === 'info_requested' ? 'Quelles précisions attendez-vous ?' : 'Motif du refus (facultatif)'}</h3>
            <Field label="Message au client">
              <textarea rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
            </Field>
            <div className="row-actions">
              <button className="btn btn-outline" onClick={() => setPending(null)}>
                Annuler
              </button>
              <button className="btn btn-primary" disabled={acting || (needsNote(pending) && note.trim().length < 3)} onClick={() => changeStatus(pending, note)}>
                Envoyer
              </button>
            </div>
          </div>
        </div>
      )}

      <SectionTitle>Détails</SectionTitle>
      <dl className="recap-list">
        {actor !== 'client' && r.client_name && (
          <>
            <dt>Client</dt>
            <dd>{r.client_name}</dd>
          </>
        )}
        {actor !== 'provider' && r.provider && (
          <>
            <dt>Prestataire</dt>
            <dd>
              <Link to={`/prestataire/${r.provider.id}`}>{r.provider.business_name}</Link>
            </dd>
          </>
        )}
        <dt>Lieu</dt>
        <dd>{r.event_location}</dd>
        {r.category && (
          <>
            <dt>Catégorie</dt>
            <dd>{r.category}</dd>
          </>
        )}
        {r.guests_approx && (
          <>
            <dt>Invités (approx.)</dt>
            <dd>{r.guests_approx}</dd>
          </>
        )}
        {r.theme && (
          <>
            <dt>Thème</dt>
            <dd>{r.theme}</dd>
          </>
        )}
        {r.colors && (
          <>
            <dt>Couleurs</dt>
            <dd>{r.colors}</dd>
          </>
        )}
        {r.requested_services && (
          <>
            <dt>Services souhaités</dt>
            <dd>{r.requested_services}</dd>
          </>
        )}
        {r.details && (
          <>
            <dt>Précisions</dt>
            <dd>{r.details}</dd>
          </>
        )}
      </dl>

      {r.inspiration_urls.length > 0 && (
        <>
          <SectionTitle>Photos d’inspiration</SectionTitle>
          <ul className="thumbs big">
            {r.inspiration_urls.map((u) => (
              <li key={u}>
                <img src={u} alt="Inspiration" loading="lazy" />
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionTitle>Échanges</SectionTitle>
      {messages.length === 0 && <p className="muted">Aucun message pour l’instant.</p>}
      <ul className="chat" aria-live="polite">
        {messages.map((m) => (
          <li key={m.id} className={m.mine ? 'mine' : ''}>
            <span className="chat-who">{m.mine ? 'Vous' : m.sender}</span>
            <p>{m.body}</p>
            <time>{formatDateTime(m.created_at)}</time>
          </li>
        ))}
      </ul>

      {actor !== 'admin' && r.status !== 'closed' && (
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
        >
          <textarea rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={2000} placeholder="Écrire un message…" aria-label="Votre message" />
          <button className="btn btn-primary btn-icon" disabled={sending || !msg.trim()} aria-label="Envoyer">
            <Send size={18} />
          </button>
        </form>
      )}
      {r.status === 'closed' && <p className="notice">Cette demande est clôturée : les échanges sont terminés.</p>}

      {actor !== 'admin' && (
        <div className="report-row">
          <ReportButton targetType="request" targetId={r.id} />
        </div>
      )}
    </>
  );
}
