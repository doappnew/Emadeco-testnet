/**
 * Machine à états des demandes de prestation.
 * Ces règles sont dupliquées côté base (fonction request_transition_allowed) en défense en profondeur.
 */
export const REQUEST_STATUSES = [
  'sent',
  'in_review',
  'info_requested',
  'response_received',
  'confirmed',
  'declined',
  'closed',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type Actor = 'client' | 'provider' | 'admin';

export const STATUS_LABELS_FR: Record<RequestStatus, string> = {
  sent: 'Envoyée',
  in_review: 'En cours d’examen',
  info_requested: 'Informations demandées',
  response_received: 'Réponse reçue',
  confirmed: 'Confirmée',
  declined: 'Refusée',
  closed: 'Clôturée',
};

type Map = Record<RequestStatus, RequestStatus[]>;

/** Transitions autorisées par la base, tous acteurs confondus. */
export const DB_TRANSITIONS: Map = {
  sent: ['in_review', 'info_requested', 'declined', 'closed'],
  in_review: ['info_requested', 'confirmed', 'declined', 'closed'],
  info_requested: ['response_received', 'declined', 'closed'],
  response_received: ['in_review', 'info_requested', 'confirmed', 'declined', 'closed'],
  confirmed: ['closed'],
  declined: ['closed'],
  closed: [],
};

const PROVIDER: Map = {
  sent: ['in_review', 'info_requested', 'declined'],
  in_review: ['info_requested', 'confirmed', 'declined'],
  info_requested: ['declined'],
  response_received: ['in_review', 'info_requested', 'confirmed', 'declined'],
  confirmed: ['closed'],
  declined: ['closed'],
  closed: [],
};

const CLIENT: Map = {
  sent: ['closed'],
  in_review: ['closed'],
  info_requested: ['response_received', 'closed'],
  response_received: ['closed'],
  confirmed: ['closed'],
  declined: ['closed'],
  closed: [],
};

const BY_ACTOR: Record<Actor, Map> = { provider: PROVIDER, client: CLIENT, admin: DB_TRANSITIONS };

export function canTransition(actor: Actor, from: RequestStatus, to: RequestStatus): boolean {
  return BY_ACTOR[actor][from]?.includes(to) ?? false;
}

export function nextStatuses(actor: Actor, from: RequestStatus): RequestStatus[] {
  return BY_ACTOR[actor][from] ?? [];
}

export const isRequestStatus = (v: unknown): v is RequestStatus =>
  typeof v === 'string' && (REQUEST_STATUSES as readonly string[]).includes(v);
