import type { RequestStatus } from './types';

export const EVENT_TYPES = [
  'Mariage',
  'Cérémonie traditionnelle / Dot',
  'Anniversaire',
  'Baby shower',
  'Baptême',
  'Événement d’entreprise',
  'Conférence / séminaire',
  'Lancement de produit',
  'Soirée de gala',
  'Location de matériel',
  'Décoration de voiture',
  'Décoration de maison',
] as const;

export const STATUS_LABELS: Record<RequestStatus, string> = {
  sent: 'Envoyée',
  in_review: 'En cours d’examen',
  info_requested: 'Informations demandées',
  response_received: 'Réponse reçue',
  confirmed: 'Confirmée',
  declined: 'Refusée',
  closed: 'Clôturée',
};

export const STATUS_TONE: Record<RequestStatus, 'info' | 'warn' | 'ok' | 'bad' | 'muted'> = {
  sent: 'info',
  in_review: 'info',
  info_requested: 'warn',
  response_received: 'warn',
  confirmed: 'ok',
  declined: 'bad',
  closed: 'muted',
};

export type RequestTab = 'progress' | 'answers' | 'done';
export const TAB_STATUSES: Record<RequestTab, RequestStatus[]> = {
  progress: ['sent', 'in_review'],
  answers: ['info_requested', 'response_received'],
  done: ['confirmed', 'declined', 'closed'],
};

/** Libellés d'action par statut cible, selon l'acteur. */
export const ACTION_LABELS: Record<'client' | 'provider' | 'admin', Partial<Record<RequestStatus, string>>> = {
  client: { closed: 'Annuler / clôturer la demande' },
  provider: {
    in_review: 'Prendre en charge',
    info_requested: 'Demander des précisions',
    confirmed: 'Confirmer la prestation',
    declined: 'Refuser',
    closed: 'Clôturer le dossier',
  },
  admin: STATUS_LABELS,
};

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', opts);
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l’instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return formatDate(iso, { day: 'numeric', month: 'short' });
}

export const splitList = (s: string, max: number): string[] =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i)
    .slice(0, max);

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || 'E';
