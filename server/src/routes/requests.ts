import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { displayName, logAdmin, notify, resolveImage, type Ctx } from '../domain.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { ah, idParam, parse } from '../lib/http.js';
import {
  canTransition,
  nextStatuses,
  STATUS_LABELS_FR,
  type Actor,
  type RequestStatus,
} from '../lib/requestStatus.js';
import { createRequestSchema, messageSchema, nn, statusChangeSchema } from '../lib/validation.js';
import { requireAuth } from '../middleware.js';
import type { Row } from '../store/types.js';

const INSPIRATION_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;
const MAX_OPEN_PER_PROVIDER = 3;

export function requestRoutes(ctx: Ctx) {
  const { store } = ctx;
  const r = Router();
  r.use(requireAuth);

  const writeLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anon',
    message: { error: { message: 'Trop d’actions rapprochées. Patientez un instant.', code: 'rate_limited' } },
  });

  /** Détermine le rôle de l'utilisateur sur la demande ; sinon la demande est « introuvable » (on ne révèle pas son existence). */
  async function loadForUser(id: string, user: Row): Promise<{ request: Row; provider: Row; actor: Actor }> {
    const [request] = await store.select('service_requests', { eq: { id }, limit: 1 });
    if (!request) throw notFound('Demande introuvable.');
    const [provider] = await store.select('provider_profiles', { eq: { id: request.provider_id }, limit: 1 });
    if (!provider) throw notFound('Demande introuvable.');
    let actor: Actor | null = null;
    if (user.role === 'admin') actor = 'admin';
    else if (request.client_id === user.id) actor = 'client';
    else if (provider.profile_id === user.id) actor = 'provider';
    if (!actor) throw notFound('Demande introuvable.');
    return { request, provider, actor };
  }

  async function summaries(rows: Row[], withClient: boolean) {
    if (!rows.length) return [];
    const [providers, cats] = await Promise.all([
      store.select('provider_profiles', { in: { id: [...new Set(rows.map((x) => x.provider_id))] } }),
      store.select('service_categories'),
    ]);
    const clients = withClient ? await store.select('profiles', { in: { id: [...new Set(rows.map((x) => x.client_id))] } }) : [];
    return Promise.all(
      rows.map(async (x) => {
        const p = providers.find((pp) => pp.id === x.provider_id);
        return {
          id: x.id,
          status: x.status as RequestStatus,
          status_label: STATUS_LABELS_FR[x.status as RequestStatus],
          status_note: x.status_note ?? null,
          event_type: x.event_type,
          event_date: x.event_date,
          event_location: x.event_location,
          created_at: x.created_at,
          updated_at: x.updated_at ?? x.created_at,
          category: cats.find((c) => c.id === x.category_id)?.name ?? null,
          provider: p ? { id: p.id, business_name: p.business_name, image_url: await resolveImage(store, p.cover_url) } : null,
          ...(withClient ? { client: { name: displayName(clients.find((c) => c.id === x.client_id)) } } : {}),
        };
      }),
    );
  }

  // ------------------------------------------------------------------ Liste
  r.get(
    '/requests',
    ah(async (req, res) => {
      const u = req.user!;
      const as = req.query.as === 'provider' ? 'provider' : 'client';
      if (as === 'provider') {
        const [p] = await store.select('provider_profiles', { eq: { profile_id: u.id }, limit: 1 });
        if (!p) return res.json({ requests: [] });
        const rows = await store.select('service_requests', { eq: { provider_id: p.id }, order: { col: 'created_at', asc: false }, limit: 200 });
        return res.json({ requests: await summaries(rows, true) });
      }
      const rows = await store.select('service_requests', { eq: { client_id: u.id }, order: { col: 'created_at', asc: false }, limit: 200 });
      res.json({ requests: await summaries(rows, false) });
    }),
  );

  // --------------------------------------------------------------- Création
  r.post(
    '/requests',
    writeLimiter,
    ah(async (req, res) => {
      const u = req.user!;
      if (u.role === 'admin') throw forbidden('Un administrateur ne peut pas créer de demande.');
      // Schéma strict : tout champ non prévu (ex. un champ financier) est refusé avec « Champ non autorisé ».
      const body = parse(createRequestSchema, req.body);

      const [provider] = await store.select('provider_profiles', { eq: { id: body.provider_id, status: 'approved' }, limit: 1 });
      if (!provider) throw notFound('Prestataire introuvable.');
      if (provider.profile_id === u.id) throw badRequest('Vous ne pouvez pas vous adresser une demande à vous-même.');

      if (body.category_id) {
        const [c] = await store.select('service_categories', { eq: { id: body.category_id, is_active: true }, limit: 1 });
        if (!c) throw badRequest('Catégorie inconnue.');
      }
      if (body.service_id) {
        const [s] = await store.select('services', { eq: { id: body.service_id, provider_id: provider.id }, limit: 1 });
        if (!s) throw badRequest('Ce service n’appartient pas à ce prestataire.');
      }
      for (const path of body.inspiration_paths) {
        if (!INSPIRATION_PATH.test(path) || !path.startsWith(`${u.id}/`)) {
          throw badRequest('Photo d’inspiration invalide.');
        }
      }

      const open = (await store.select('service_requests', { eq: { client_id: u.id, provider_id: provider.id } })).filter(
        (x) => !['closed', 'declined', 'confirmed'].includes(x.status),
      );
      if (open.length >= MAX_OPEN_PER_PROVIDER) {
        throw conflict(`Vous avez déjà ${MAX_OPEN_PER_PROVIDER} demandes en cours auprès de ce prestataire.`);
      }

      const [created] = await store.insert('service_requests', {
        client_id: u.id,
        provider_id: provider.id,
        category_id: body.category_id ?? null,
        service_id: body.service_id ?? null,
        event_type: body.event_type,
        event_date: body.event_date,
        event_location: body.event_location,
        guests_approx: body.guests_approx ?? null,
        theme: nn(body.theme),
        colors: nn(body.colors),
        requested_services: nn(body.requested_services),
        details: nn(body.details),
        inspiration_paths: body.inspiration_paths,
        status: 'sent',
        status_note: null,
        updated_at: new Date().toISOString(),
      });
      await notify(store, {
        user_id: provider.profile_id,
        type: 'request_new',
        title: 'Nouvelle demande de prestation',
        body: `${body.event_type} — ${body.event_date}`,
        request_id: created.id,
      });
      res.status(201).json({ id: created.id, status: created.status });
    }),
  );

  // ----------------------------------------------------------------- Détail
  r.get(
    '/requests/:id',
    ah(async (req, res) => {
      const u = req.user!;
      const { request, provider, actor } = await loadForUser(idParam(req), u);
      // Un administrateur qui consulte une demande privée laisse une trace dans le journal.
      if (actor === 'admin') await logAdmin(store, u.id, 'request.view', 'request', request.id);
      const [[summary], messages, senders, [clientProfile]] = await Promise.all([
        summaries([request], actor !== 'client'),
        store.select('request_messages', { eq: { request_id: request.id }, order: { col: 'created_at', asc: true }, limit: 500 }),
        store.select('profiles', { in: { id: [request.client_id, provider.profile_id] } }),
        store.select('profiles', { eq: { id: request.client_id }, limit: 1 }),
      ]);
      const inspiration = (
        await Promise.all((request.inspiration_paths as string[]).map((p) => store.fileUrl('inspiration', p)))
      ).filter(Boolean);
      res.json({
        request: {
          ...summary,
          guests_approx: request.guests_approx,
          theme: request.theme,
          colors: request.colors,
          requested_services: request.requested_services,
          details: request.details,
          inspiration_urls: inspiration,
          client_name: actor === 'client' ? undefined : displayName(clientProfile),
        },
        actor,
        next_statuses: nextStatuses(actor, request.status).map((s) => ({ status: s, label: STATUS_LABELS_FR[s] })),
        messages: messages.map((m) => ({
          id: m.id,
          body: m.body,
          created_at: m.created_at,
          mine: m.sender_id === u.id,
          sender: displayName(senders.find((s) => s.id === m.sender_id)),
        })),
      });
    }),
  );

  // ------------------------------------------------------- Changement de statut
  r.post(
    '/requests/:id/status',
    writeLimiter,
    ah(async (req, res) => {
      const u = req.user!;
      const { request, provider, actor } = await loadForUser(idParam(req), u);
      const body = parse(statusChangeSchema, req.body);

      if (actor === 'provider' && provider.status === 'suspended') throw forbidden('Votre profil est suspendu.');
      if (!canTransition(actor, request.status, body.status)) {
        throw conflict(
          `Passage de « ${STATUS_LABELS_FR[request.status as RequestStatus]} » à « ${STATUS_LABELS_FR[body.status]} » non autorisé.`,
          'invalid_transition',
        );
      }
      if (actor === 'provider' && body.status === 'info_requested' && !(body.note && body.note.length >= 3)) {
        throw badRequest('Indiquez les précisions que vous attendez du client.');
      }

      const [updated] = await store.update(
        'service_requests',
        { eq: { id: request.id } },
        { status: body.status, status_note: nn(body.note) },
      );

      const recipient = actor === 'client' ? provider.profile_id : request.client_id;
      if (actor !== 'admin') {
        await notify(store, {
          user_id: recipient,
          type: 'request_status',
          title: `Demande : ${STATUS_LABELS_FR[body.status]}`,
          body: body.note ?? `${request.event_type} — ${request.event_date}`,
          request_id: request.id,
        });
      } else {
        await Promise.all([
          notify(store, { user_id: request.client_id, type: 'request_status', title: `Demande : ${STATUS_LABELS_FR[body.status]}`, request_id: request.id }),
          notify(store, { user_id: provider.profile_id, type: 'request_status', title: `Demande : ${STATUS_LABELS_FR[body.status]}`, request_id: request.id }),
        ]);
      }
      res.json({ id: updated.id, status: updated.status, status_label: STATUS_LABELS_FR[updated.status as RequestStatus] });
    }),
  );

  // ----------------------------------------------------------------- Messages
  r.post(
    '/requests/:id/messages',
    writeLimiter,
    ah(async (req, res) => {
      const u = req.user!;
      const { request, provider, actor } = await loadForUser(idParam(req), u);
      if (actor === 'admin') throw forbidden('Les administrateurs ne peuvent pas écrire dans une conversation.');
      if (request.status === 'closed') throw conflict('Cette demande est clôturée.', 'request_closed');
      if (actor === 'provider' && provider.status === 'suspended') throw forbidden('Votre profil est suspendu.');
      const { body } = parse(messageSchema, req.body);

      const [m] = await store.insert('request_messages', { request_id: request.id, sender_id: u.id, body });

      // Quand le client répond à une demande de précisions, le statut passe automatiquement à « Réponse reçue ».
      if (actor === 'client' && request.status === 'info_requested') {
        await store.update('service_requests', { eq: { id: request.id } }, { status: 'response_received', status_note: null });
      }
      const recipient = actor === 'client' ? provider.profile_id : request.client_id;
      await notify(store, {
        user_id: recipient,
        type: 'message_new',
        title: 'Nouveau message',
        body: body.slice(0, 120),
        request_id: request.id,
      });
      res.status(201).json({ id: m.id, created_at: m.created_at });
    }),
  );

  return r;
}
