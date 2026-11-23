import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { notify, providerCards, publicProfile, withImageUrl, type Ctx } from '../domain.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { ah, idParam, parse } from '../lib/http.js';
import { MAX_UPLOAD_BYTES, processImage } from '../lib/images.js';
import {
  favoriteSchema,
  nn,
  profileUpdateSchema,
  providerProfileSchema,
  reportSchema,
} from '../lib/validation.js';
import { requireAuth } from '../middleware.js';

export const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10, parts: 12 },
}).single('file');

/** Routes de l'utilisateur connecté : profil, candidature prestataire, favoris, notifications, signalements. */
export function meRoutes(ctx: Ctx) {
  const { store } = ctx;
  const r = Router();
  r.use(requireAuth);

  r.get(
    '/me',
    ah(async (req, res) => {
      const u = req.user!;
      const [[provider], unread] = await Promise.all([
        store.select('provider_profiles', { eq: { profile_id: u.id }, limit: 1 }),
        store.count('notifications', { eq: { user_id: u.id, read_at: null } }),
      ]);
      res.json({
        profile: publicProfile(u),
        provider: provider ? { id: provider.id, business_name: provider.business_name, status: provider.status } : null,
        unread_notifications: unread,
      });
    }),
  );

  r.patch(
    '/me',
    ah(async (req, res) => {
      const body = parse(profileUpdateSchema, req.body);
      const patch: Record<string, unknown> = {};
      if ('display_name' in body) patch.display_name = nn(body.display_name);
      if ('city' in body) patch.city = nn(body.city);
      const [p] = await store.update('profiles', { eq: { id: req.user!.id } }, patch);
      res.json({ profile: publicProfile(p) });
    }),
  );

  /** Candidature prestataire : crée un profil « en attente » que l'administrateur doit valider. */
  r.post(
    '/me/provider',
    ah(async (req, res) => {
      const u = req.user!;
      if (u.role === 'admin') throw forbidden('Un administrateur ne peut pas être prestataire.');
      const body = parse(providerProfileSchema, req.body);
      const [existing] = await store.select('provider_profiles', { eq: { profile_id: u.id }, limit: 1 });
      if (existing) throw conflict('Vous avez déjà un profil prestataire.');
      const [created] = await store.insert('provider_profiles', {
        profile_id: u.id,
        business_name: body.business_name,
        bio: nn(body.bio),
        specialties: body.specialties,
        service_zones: body.service_zones,
        city: nn(body.city),
        cover_url: null,
        status: 'pending',
        is_demo: false,
        updated_at: new Date().toISOString(),
      });
      await store.update('profiles', { eq: { id: u.id } }, { role: 'provider' });
      const admins = await store.select('profiles', { eq: { role: 'admin', status: 'active' } });
      await Promise.all(
        admins.map((a) =>
          notify(store, { user_id: a.id, type: 'provider_review', title: 'Nouveau profil à valider', body: body.business_name }),
        ),
      );
      res.status(201).json({ provider: { id: created.id, business_name: created.business_name, status: created.status } });
    }),
  );

  // ------------------------------------------------------------------ Favoris
  r.get(
    '/favorites',
    ah(async (req, res) => {
      const favs = await store.select('favorites', { eq: { user_id: req.user!.id }, order: { col: 'created_at', asc: false } });
      const providerIds = favs.filter((f) => f.provider_id).map((f) => f.provider_id);
      const itemIds = favs.filter((f) => f.portfolio_item_id).map((f) => f.portfolio_item_id);
      const [providers, items] = await Promise.all([
        providerIds.length ? store.select('provider_profiles', { in: { id: providerIds }, eq: { status: 'approved' } }) : [],
        itemIds.length ? store.select('portfolio_items', { in: { id: itemIds }, eq: { moderation_status: 'approved' } }) : [],
      ]);
      const cards = await providerCards(store, providers);
      const itemsWithUrl = await withImageUrl(store, items);
      res.json({
        providers: favs
          .map((f) => ({ favorite_id: f.id, card: cards.find((c) => c.id === f.provider_id) }))
          .filter((x) => x.card)
          .map((x) => ({ favorite_id: x.favorite_id, ...x.card! })),
        items: favs
          .map((f) => ({ favorite_id: f.id, item: itemsWithUrl.find((i) => i.id === f.portfolio_item_id) }))
          .filter((x) => x.item)
          .map((x) => ({ favorite_id: x.favorite_id, ...x.item! })),
      });
    }),
  );

  r.post(
    '/favorites',
    ah(async (req, res) => {
      const body = parse(favoriteSchema, req.body);
      const u = req.user!;
      if (body.provider_id) {
        const [p] = await store.select('provider_profiles', { eq: { id: body.provider_id, status: 'approved' }, limit: 1 });
        if (!p) throw notFound('Prestataire introuvable.');
        const [dup] = await store.select('favorites', { eq: { user_id: u.id, provider_id: body.provider_id }, limit: 1 });
        if (dup) return res.json({ favorite_id: dup.id });
        const [f] = await store.insert('favorites', { user_id: u.id, provider_id: body.provider_id, portfolio_item_id: null });
        return res.status(201).json({ favorite_id: f.id });
      }
      const [item] = await store.select('portfolio_items', { eq: { id: body.portfolio_item_id!, moderation_status: 'approved' }, limit: 1 });
      if (!item) throw notFound('Réalisation introuvable.');
      const [dup] = await store.select('favorites', { eq: { user_id: u.id, portfolio_item_id: body.portfolio_item_id }, limit: 1 });
      if (dup) return res.json({ favorite_id: dup.id });
      const [f] = await store.insert('favorites', { user_id: u.id, provider_id: null, portfolio_item_id: body.portfolio_item_id });
      res.status(201).json({ favorite_id: f.id });
    }),
  );

  r.delete(
    '/favorites/:id',
    ah(async (req, res) => {
      // La condition user_id empêche de supprimer le favori d'un autre utilisateur.
      const n = await store.remove('favorites', { eq: { id: idParam(req), user_id: req.user!.id } });
      if (!n) throw notFound();
      res.status(204).end();
    }),
  );

  // ------------------------------------------------------------ Notifications
  r.get(
    '/notifications',
    ah(async (req, res) => {
      const items = await store.select('notifications', { eq: { user_id: req.user!.id }, order: { col: 'created_at', asc: false }, limit: 50 });
      res.json({ notifications: items, unread: items.filter((n) => !n.read_at).length });
    }),
  );

  r.post(
    '/notifications/read',
    ah(async (req, res) => {
      const ids: unknown = req.body?.ids;
      const u = req.user!;
      const now = new Date().toISOString();
      if (Array.isArray(ids)) {
        const valid = ids.filter((i): i is string => typeof i === 'string' && /^[0-9a-f-]{36}$/i.test(i)).slice(0, 100);
        if (valid.length) await store.update('notifications', { eq: { user_id: u.id }, in: { id: valid } }, { read_at: now });
      } else {
        await store.update('notifications', { eq: { user_id: u.id, read_at: null }, in: {} }, { read_at: now });
      }
      res.json({ ok: true });
    }),
  );

  // -------------------------------------------------------------- Signalements
  r.post(
    '/reports',
    ah(async (req, res) => {
      const u = req.user!;
      const body = parse(reportSchema, req.body);

      if (body.target_type === 'provider') {
        const [p] = await store.select('provider_profiles', { eq: { id: body.target_id }, limit: 1 });
        if (!p) throw notFound('Élément introuvable.');
        if (p.profile_id === u.id) throw badRequest('Vous ne pouvez pas vous signaler vous-même.');
      } else if (body.target_type === 'portfolio_item') {
        const [i] = await store.select('portfolio_items', { eq: { id: body.target_id }, limit: 1 });
        if (!i) throw notFound('Élément introuvable.');
      } else if (body.target_type === 'user') {
        if (body.target_id === u.id) throw badRequest('Vous ne pouvez pas vous signaler vous-même.');
        const [t] = await store.select('profiles', { eq: { id: body.target_id }, limit: 1 });
        if (!t) throw notFound('Élément introuvable.');
      } else {
        const [rq] = await store.select('service_requests', { eq: { id: body.target_id }, limit: 1 });
        if (!rq) throw notFound('Élément introuvable.');
        const [pp] = await store.select('provider_profiles', { eq: { id: rq.provider_id }, limit: 1 });
        if (rq.client_id !== u.id && pp?.profile_id !== u.id) throw notFound('Élément introuvable.');
      }

      const [dup] = await store.select('reports', {
        eq: { reporter_id: u.id, target_type: body.target_type, target_id: body.target_id, status: 'open' },
        limit: 1,
      });
      if (dup) throw conflict('Vous avez déjà signalé cet élément ; il est en cours d’examen.');

      const [rep] = await store.insert('reports', {
        reporter_id: u.id,
        target_type: body.target_type,
        target_id: body.target_id,
        reason: body.reason,
        details: nn(body.details),
        status: 'open',
        handled_by: null,
        handled_at: null,
      });
      const admins = await store.select('profiles', { eq: { role: 'admin', status: 'active' } });
      await Promise.all(admins.map((a) => notify(store, { user_id: a.id, type: 'moderation', title: 'Nouveau signalement', body: body.reason })));
      res.status(201).json({ id: rep.id });
    }),
  );

  // ------------------------------------------------- Photos d'inspiration (client)
  r.post(
    '/uploads/inspiration',
    (req, res, next) =>
      uploadSingle(req, res, (err: unknown) => {
        if (!err) return next();
        const code = (err as { code?: string }).code;
        next(badRequest(code === 'LIMIT_FILE_SIZE' ? 'Image trop lourde (5 Mo maximum).' : 'Envoi invalide.'));
      }),
    ah(async (req, res) => {
      if (!req.file) throw badRequest('Aucun fichier reçu (champ « file »).');
      const img = await processImage(req.file.buffer);
      const path = `${req.user!.id}/${randomUUID()}.${img.ext}`;
      await store.putFile('inspiration', path, img.data, img.contentType);
      res.status(201).json({ path, preview_url: await store.fileUrl('inspiration', path) });
    }),
  );

  return r;
}
