import { Router } from 'express';
import { displayName, logAdmin, notify, providerCards, withImageUrl, type Ctx } from '../domain.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { ah, idParam, norm, parse } from '../lib/http.js';
import { REQUEST_STATUSES, STATUS_LABELS_FR, type RequestStatus } from '../lib/requestStatus.js';
import {
  categorySchema,
  nn,
  portfolioModerationSchema,
  providerModerationSchema,
  reportResolveSchema,
  userStatusSchema,
} from '../lib/validation.js';
import { requireRole } from '../middleware.js';

/** Espace administrateur. Chaque action sensible est consignée dans admin_logs. */
export function adminRoutes(ctx: Ctx) {
  const { store } = ctx;
  const r = Router();
  r.use(requireRole('admin'));

  // ---------------------------------------------------------------- Statistiques
  r.get(
    '/stats',
    ah(async (_req, res) => {
      const [users, providers, requests, items, reports] = await Promise.all([
        store.select('profiles', { limit: 5000 }),
        store.select('provider_profiles', { limit: 5000 }),
        store.select('service_requests', { limit: 5000 }),
        store.select('portfolio_items', { limit: 5000 }),
        store.select('reports', { limit: 5000 }),
      ]);
      const by = <T extends Record<string, unknown>>(rows: T[], key: keyof T) =>
        rows.reduce<Record<string, number>>((acc, row) => {
          const k = String(row[key]);
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {});
      const days: Record<string, number> = {};
      for (let i = 13; i >= 0; i--) days[new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10)] = 0;
      for (const rq of requests) {
        const d = String(rq.created_at).slice(0, 10);
        if (d in days) days[d]++;
      }
      res.json({
        users: { total: users.length, by_role: by(users, 'role'), suspended: users.filter((u) => u.status === 'suspended').length },
        providers: by(providers, 'status'),
        requests: { total: requests.length, by_status: by(requests, 'status') },
        portfolio: by(items, 'moderation_status'),
        reports: by(reports, 'status'),
        requests_last_14_days: Object.entries(days).map(([date, count]) => ({ date, count })),
      });
    }),
  );

  // ---------------------------------------------------------------- Utilisateurs
  r.get(
    '/users',
    ah(async (req, res) => {
      const where: Record<string, unknown> = {};
      if (typeof req.query.role === 'string' && ['client', 'provider', 'admin'].includes(req.query.role)) where.role = req.query.role;
      if (typeof req.query.status === 'string' && ['active', 'suspended'].includes(req.query.status)) where.status = req.query.status;
      let rows = await store.select('profiles', { eq: where, order: { col: 'created_at', asc: false }, limit: 500 });
      if (typeof req.query.q === 'string' && req.query.q.trim()) {
        const t = norm(req.query.q);
        rows = rows.filter((u) => norm(u.pi_username).includes(t) || norm(u.display_name).includes(t));
      }
      res.json({
        users: rows.map((u) => ({
          id: u.id,
          pi_username: u.pi_username,
          display_name: u.display_name,
          role: u.role,
          status: u.status,
          city: u.city,
          is_demo: u.is_demo,
          created_at: u.created_at,
        })),
      });
    }),
  );

  r.post(
    '/users/:id/status',
    ah(async (req, res) => {
      const admin = req.user!;
      const id = idParam(req);
      const body = parse(userStatusSchema, req.body);
      if (id === admin.id) throw badRequest('Vous ne pouvez pas modifier votre propre compte.');
      const [target] = await store.select('profiles', { eq: { id }, limit: 1 });
      if (!target) throw notFound();
      if (target.role === 'admin') throw badRequest('Un compte administrateur ne peut pas être suspendu ici.');
      await store.update('profiles', { eq: { id } }, { status: body.status });
      // Suspendre un prestataire le retire aussi du catalogue public.
      if (body.status === 'suspended') {
        await store.update('provider_profiles', { eq: { profile_id: id } }, { status: 'suspended' });
      }
      await logAdmin(store, admin.id, body.status === 'suspended' ? 'user.suspend' : 'user.reactivate', 'user', id, { note: body.note ?? null });
      res.json({ id, status: body.status });
    }),
  );

  // --------------------------------------------------------------- Prestataires
  r.get(
    '/providers',
    ah(async (req, res) => {
      const where: Record<string, unknown> = {};
      if (typeof req.query.status === 'string' && ['pending', 'approved', 'rejected', 'suspended'].includes(req.query.status)) {
        where.status = req.query.status;
      }
      const rows = await store.select('provider_profiles', { eq: where, order: { col: 'created_at', asc: false }, limit: 500 });
      const cards = await providerCards(store, rows);
      const owners = rows.length ? await store.select('profiles', { in: { id: rows.map((p) => p.profile_id) } }) : [];
      res.json({
        providers: cards.map((c) => {
          const row = rows.find((p) => p.id === c.id)!;
          return { ...c, owner: displayName(owners.find((o) => o.id === row.profile_id)), is_demo: row.is_demo, created_at: row.created_at };
        }),
      });
    }),
  );

  r.post(
    '/providers/:id/status',
    ah(async (req, res) => {
      const admin = req.user!;
      const id = idParam(req);
      const body = parse(providerModerationSchema, req.body);
      const [p] = await store.update('provider_profiles', { eq: { id } }, { status: body.status });
      if (!p) throw notFound();
      await logAdmin(store, admin.id, `provider.${body.status}`, 'provider', id, { note: body.note ?? null });
      await notify(store, {
        user_id: p.profile_id,
        type: 'provider_review',
        title:
          body.status === 'approved'
            ? 'Votre profil est validé'
            : body.status === 'rejected'
              ? 'Votre profil doit être complété'
              : body.status === 'suspended'
                ? 'Votre profil est suspendu'
                : 'Votre profil est en cours de validation',
        body: body.note ?? null,
      });
      res.json({ id, status: body.status });
    }),
  );

  // ----------------------------------------------------------------- Catégories
  r.get(
    '/categories',
    ah(async (_req, res) => {
      res.json({ categories: await store.select('service_categories', { order: { col: 'sort_order', asc: true } }) });
    }),
  );

  r.post(
    '/categories',
    ah(async (req, res) => {
      const body = parse(categorySchema, req.body);
      const [dup] = await store.select('service_categories', { eq: { slug: body.slug }, limit: 1 });
      if (dup) throw conflict('Ce slug existe déjà.');
      const [c] = await store.insert('service_categories', {
        slug: body.slug,
        name: body.name,
        description: nn(body.description),
        image_url: nn(body.image_url),
        sort_order: body.sort_order,
        is_active: body.is_active,
      });
      await logAdmin(store, req.user!.id, 'category.create', 'category', c.id, { slug: body.slug });
      res.status(201).json({ category: c });
    }),
  );

  r.put(
    '/categories/:id',
    ah(async (req, res) => {
      const id = idParam(req);
      const body = parse(categorySchema, req.body);
      const [dup] = await store.select('service_categories', { eq: { slug: body.slug }, neq: { id }, limit: 1 });
      if (dup) throw conflict('Ce slug existe déjà.');
      const [c] = await store.update('service_categories', { eq: { id } }, {
        slug: body.slug,
        name: body.name,
        description: nn(body.description),
        image_url: nn(body.image_url),
        sort_order: body.sort_order,
        is_active: body.is_active,
      });
      if (!c) throw notFound();
      await logAdmin(store, req.user!.id, 'category.update', 'category', id, { slug: body.slug });
      res.json({ category: c });
    }),
  );

  r.delete(
    '/categories/:id',
    ah(async (req, res) => {
      const id = idParam(req);
      if (await store.count('services', { eq: { category_id: id } })) {
        throw conflict('Cette catégorie est utilisée par des services : désactivez-la plutôt que de la supprimer.', 'category_in_use');
      }
      const n = await store.remove('service_categories', { eq: { id } });
      if (!n) throw notFound();
      await logAdmin(store, req.user!.id, 'category.delete', 'category', id);
      res.status(204).end();
    }),
  );

  // ------------------------------------------------------------------ Réalisations
  r.get(
    '/portfolio',
    ah(async (req, res) => {
      const status = typeof req.query.status === 'string' && ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
      const items = await store.select('portfolio_items', { eq: { moderation_status: status }, order: { col: 'created_at', asc: false }, limit: 200 });
      const providers = items.length ? await store.select('provider_profiles', { in: { id: [...new Set(items.map((i) => i.provider_id))] } }) : [];
      const withUrl = await withImageUrl(store, items);
      res.json({ items: withUrl.map((i) => ({ ...i, provider_name: providers.find((p) => p.id === i.provider_id)?.business_name ?? null })) });
    }),
  );

  r.post(
    '/portfolio/:id/moderate',
    ah(async (req, res) => {
      const id = idParam(req);
      const body = parse(portfolioModerationSchema, req.body);
      const [item] = await store.update('portfolio_items', { eq: { id } }, { moderation_status: body.status });
      if (!item) throw notFound();
      const [prov] = await store.select('provider_profiles', { eq: { id: item.provider_id }, limit: 1 });
      await logAdmin(store, req.user!.id, `portfolio.${body.status}`, 'portfolio_item', id, { note: body.note ?? null });
      if (prov) {
        await notify(store, {
          user_id: prov.profile_id,
          type: 'moderation',
          title: body.status === 'approved' ? 'Photo publiée' : 'Photo refusée',
          body: body.status === 'rejected' ? (body.note ?? item.title) : item.title,
        });
      }
      res.json({ id, moderation_status: body.status });
    }),
  );

  r.delete(
    '/portfolio/:id',
    ah(async (req, res) => {
      const id = idParam(req);
      const [item] = await store.select('portfolio_items', { eq: { id }, limit: 1 });
      if (!item) throw notFound();
      await store.remove('portfolio_items', { eq: { id } });
      if (!String(item.image_path).startsWith('/')) await store.removeFile('portfolio', item.image_path);
      await logAdmin(store, req.user!.id, 'portfolio.delete', 'portfolio_item', id);
      res.status(204).end();
    }),
  );

  // -------------------------------------------------------------------- Demandes
  r.get(
    '/requests',
    ah(async (req, res) => {
      const where: Record<string, unknown> = {};
      const s = req.query.status;
      if (typeof s === 'string' && (REQUEST_STATUSES as readonly string[]).includes(s)) where.status = s;
      const rows = await store.select('service_requests', { eq: where, order: { col: 'created_at', asc: false }, limit: 200 });
      const [providers, clients] = await Promise.all([
        rows.length ? store.select('provider_profiles', { in: { id: [...new Set(rows.map((x) => x.provider_id))] } }) : [],
        rows.length ? store.select('profiles', { in: { id: [...new Set(rows.map((x) => x.client_id))] } }) : [],
      ]);
      res.json({
        requests: rows.map((x) => ({
          id: x.id,
          status: x.status,
          status_label: STATUS_LABELS_FR[x.status as RequestStatus],
          event_type: x.event_type,
          event_date: x.event_date,
          event_location: x.event_location,
          created_at: x.created_at,
          provider: providers.find((p) => p.id === x.provider_id)?.business_name ?? null,
          client: displayName(clients.find((c) => c.id === x.client_id)),
        })),
      });
    }),
  );

  // ----------------------------------------------------------------- Signalements
  r.get(
    '/reports',
    ah(async (req, res) => {
      const where: Record<string, unknown> = {};
      if (typeof req.query.status === 'string' && ['open', 'reviewed', 'dismissed', 'actioned'].includes(req.query.status)) where.status = req.query.status;
      const rows = await store.select('reports', { eq: where, order: { col: 'created_at', asc: false }, limit: 200 });
      const reporters = rows.length ? await store.select('profiles', { in: { id: [...new Set(rows.map((x) => x.reporter_id))] } }) : [];
      res.json({
        reports: rows.map((x) => ({ ...x, reporter: displayName(reporters.find((p) => p.id === x.reporter_id)) })),
      });
    }),
  );

  r.post(
    '/reports/:id/resolve',
    ah(async (req, res) => {
      const id = idParam(req);
      const body = parse(reportResolveSchema, req.body);
      const [rep] = await store.update('reports', { eq: { id } }, { status: body.status, handled_by: req.user!.id, handled_at: new Date().toISOString() });
      if (!rep) throw notFound();
      await logAdmin(store, req.user!.id, `report.${body.status}`, 'report', id, { target_type: rep.target_type, target_id: rep.target_id, note: body.note ?? null });
      res.json({ id, status: body.status });
    }),
  );

  // ------------------------------------------------------------------------ Journal
  r.get(
    '/logs',
    ah(async (_req, res) => {
      const logs = await store.select('admin_logs', { order: { col: 'created_at', asc: false }, limit: 100 });
      const admins = logs.length ? await store.select('profiles', { in: { id: [...new Set(logs.map((l) => l.admin_id).filter(Boolean))] } }) : [];
      res.json({ logs: logs.map((l) => ({ ...l, admin: displayName(admins.find((a) => a.id === l.admin_id)) })) });
    }),
  );

  return r;
}
