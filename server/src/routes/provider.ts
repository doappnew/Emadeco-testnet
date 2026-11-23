import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { notify, withImageUrl, type Ctx } from '../domain.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { ah, idParam, parse } from '../lib/http.js';
import { processImage } from '../lib/images.js';
import { nn, portfolioMetaSchema, providerProfileSchema, serviceSchema } from '../lib/validation.js';
import { requireRole } from '../middleware.js';
import { uploadSingle } from './me.js';
import type { Row } from '../store/types.js';

const MAX_PORTFOLIO = 60;
const MAX_SERVICES = 30;

/** Espace prestataire : profil, services, portfolio. Réservé au rôle « provider ». */
export function providerRoutes(ctx: Ctx) {
  const { store } = ctx;
  const r = Router();
  r.use(requireRole('provider'));

  async function myProvider(profileId: string): Promise<Row> {
    const [p] = await store.select('provider_profiles', { eq: { profile_id: profileId }, limit: 1 });
    if (!p) throw notFound('Profil prestataire introuvable.');
    return p;
  }
  /** Un prestataire suspendu ne peut plus modifier son contenu. */
  const assertNotSuspended = (p: Row) => {
    if (p.status === 'suspended') throw forbidden('Votre profil est suspendu.');
  };

  r.get(
    '/me',
    ah(async (req, res) => {
      const p = await myProvider(req.user!.id);
      const [services, items, requests] = await Promise.all([
        store.select('services', { eq: { provider_id: p.id }, order: { col: 'created_at', asc: false } }),
        store.select('portfolio_items', { eq: { provider_id: p.id }, order: { col: 'created_at', asc: false } }),
        store.select('service_requests', { eq: { provider_id: p.id } }),
      ]);
      const open = requests.filter((x) => !['closed', 'declined', 'confirmed'].includes(x.status)).length;
      res.json({
        provider: p,
        services,
        portfolio: await withImageUrl(store, items),
        stats: { requests_total: requests.length, requests_open: open },
      });
    }),
  );

  r.put(
    '/me',
    ah(async (req, res) => {
      const p = await myProvider(req.user!.id);
      assertNotSuspended(p);
      const body = parse(providerProfileSchema, req.body);
      const patch: Row = {
        business_name: body.business_name,
        bio: nn(body.bio),
        specialties: body.specialties,
        service_zones: body.service_zones,
        city: nn(body.city),
      };
      // Un profil refusé qui est corrigé repart en validation.
      if (p.status === 'rejected') patch.status = 'pending';
      const [updated] = await store.update('provider_profiles', { eq: { id: p.id } }, patch);
      res.json({ provider: updated });
    }),
  );

  // ----------------------------------------------------------------- Services
  r.post(
    '/services',
    ah(async (req, res) => {
      const p = await myProvider(req.user!.id);
      assertNotSuspended(p);
      const body = parse(serviceSchema, req.body);
      const [cat] = await store.select('service_categories', { eq: { id: body.category_id, is_active: true }, limit: 1 });
      if (!cat) throw badRequest('Catégorie inconnue.');
      if ((await store.count('services', { eq: { provider_id: p.id } })) >= MAX_SERVICES) throw conflict('Nombre maximum de services atteint.');
      const [s] = await store.insert('services', {
        provider_id: p.id,
        category_id: body.category_id,
        title: body.title,
        description: nn(body.description),
        is_active: body.is_active,
        updated_at: new Date().toISOString(),
      });
      res.status(201).json({ service: s });
    }),
  );

  r.put(
    '/services/:id',
    ah(async (req, res) => {
      const p = await myProvider(req.user!.id);
      assertNotSuspended(p);
      const body = parse(serviceSchema, req.body);
      const [cat] = await store.select('service_categories', { eq: { id: body.category_id }, limit: 1 });
      if (!cat) throw badRequest('Catégorie inconnue.');
      // La clause provider_id garantit qu'on ne modifie que ses propres services.
      const [s] = await store.update(
        'services',
        { eq: { id: idParam(req), provider_id: p.id } },
        { category_id: body.category_id, title: body.title, description: nn(body.description), is_active: body.is_active },
      );
      if (!s) throw notFound();
      res.json({ service: s });
    }),
  );

  r.delete(
    '/services/:id',
    ah(async (req, res) => {
      const p = await myProvider(req.user!.id);
      assertNotSuspended(p);
      const n = await store.remove('services', { eq: { id: idParam(req), provider_id: p.id } });
      if (!n) throw notFound();
      res.status(204).end();
    }),
  );

  // ---------------------------------------------------------------- Portfolio
  r.post(
    '/portfolio',
    (req, res, next) =>
      uploadSingle(req, res, (err: unknown) => {
        if (!err) return next();
        const code = (err as { code?: string }).code;
        next(badRequest(code === 'LIMIT_FILE_SIZE' ? 'Image trop lourde (5 Mo maximum).' : 'Envoi invalide.'));
      }),
    ah(async (req, res) => {
      const p = await myProvider(req.user!.id);
      assertNotSuspended(p);
      if (!req.file) throw badRequest('Aucun fichier reçu (champ « file »).');
      const meta = parse(portfolioMetaSchema, {
        title: req.body?.title,
        description: req.body?.description || undefined,
        category_id: req.body?.category_id || undefined,
      });
      if (meta.category_id) {
        const [c] = await store.select('service_categories', { eq: { id: meta.category_id }, limit: 1 });
        if (!c) throw badRequest('Catégorie inconnue.');
      }
      if ((await store.count('portfolio_items', { eq: { provider_id: p.id } })) >= MAX_PORTFOLIO) {
        throw conflict('Nombre maximum de réalisations atteint.');
      }
      const img = await processImage(req.file.buffer);
      const path = `${p.id}/${randomUUID()}.${img.ext}`;
      await store.putFile('portfolio', path, img.data, img.contentType);
      const [item] = await store.insert('portfolio_items', {
        provider_id: p.id,
        category_id: meta.category_id ?? null,
        title: meta.title,
        description: nn(meta.description),
        image_path: path,
        moderation_status: 'pending',
      });
      const admins = await store.select('profiles', { eq: { role: 'admin', status: 'active' } });
      await Promise.all(admins.map((a) => notify(store, { user_id: a.id, type: 'moderation', title: 'Photo à modérer', body: meta.title })));
      const [view] = await withImageUrl(store, [item]);
      res.status(201).json({ item: view });
    }),
  );

  r.delete(
    '/portfolio/:id',
    ah(async (req, res) => {
      const p = await myProvider(req.user!.id);
      const [item] = await store.select('portfolio_items', { eq: { id: idParam(req), provider_id: p.id }, limit: 1 });
      if (!item) throw notFound();
      await store.remove('portfolio_items', { eq: { id: item.id } });
      if (!String(item.image_path).startsWith('/')) await store.removeFile('portfolio', item.image_path);
      res.status(204).end();
    }),
  );

  return r;
}
