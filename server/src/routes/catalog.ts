import { Router } from 'express';
import { providerCards, resolveImage, withImageUrl, type Ctx } from '../domain.js';
import { notFound } from '../lib/errors.js';
import { ah, idParam, norm, parse } from '../lib/http.js';
import { providerQuerySchema } from '../lib/validation.js';
import type { Row } from '../store/types.js';

/** Routes publiques : catalogue, prestataires approuvés et réalisations modérées. */
export function catalogRoutes(ctx: Ctx) {
  const { store } = ctx;
  const r = Router();

  const activeCategories = () =>
    store.select('service_categories', { eq: { is_active: true }, order: { col: 'sort_order', asc: true } });

  /** Réalisations approuvées dont le prestataire est lui-même approuvé. */
  async function publicPortfolio(filter: { categoryId?: string; providerId?: string; limit?: number }) {
    const approved = await store.select('provider_profiles', { eq: { status: 'approved' } });
    const names = new Map(approved.map((p) => [p.id, p.business_name as string]));
    if (!names.size) return [];
    const where: Record<string, unknown> = { moderation_status: 'approved' };
    if (filter.categoryId) where.category_id = filter.categoryId;
    if (filter.providerId) where.provider_id = filter.providerId;
    const items = (
      await store.select('portfolio_items', { eq: where, order: { col: 'created_at', asc: false }, limit: 300 })
    ).filter((i) => names.has(i.provider_id));
    const sliced = items.slice(0, filter.limit ?? 60);
    const withUrl = await withImageUrl(store, sliced);
    return withUrl.map((i) => ({ ...i, provider_name: names.get(i.provider_id) }));
  }

  r.get(
    '/categories',
    ah(async (_req, res) => {
      res.json({ categories: await activeCategories() });
    }),
  );

  /** Données de la page d'accueil en un seul appel (connexions mobiles limitées). */
  r.get(
    '/home',
    ah(async (_req, res) => {
      const [categories, featured, providers] = await Promise.all([
        activeCategories(),
        publicPortfolio({ limit: 8 }),
        store.select('provider_profiles', { eq: { status: 'approved' }, order: { col: 'created_at', asc: false }, limit: 6 }),
      ]);
      res.json({ categories, featured, providers: await providerCards(store, providers) });
    }),
  );

  r.get(
    '/providers',
    ah(async (req, res) => {
      const q = parse(providerQuerySchema, req.query);
      const [rows, cats] = await Promise.all([
        store.select('provider_profiles', { eq: { status: 'approved' }, order: { col: 'created_at', asc: false }, limit: 500 }),
        store.select('service_categories'),
      ]);
      let cards = await providerCards(store, rows);

      if (q.category) {
        const cat = cats.find((c) => c.slug === q.category || c.id === q.category);
        cards = cat ? cards.filter((c) => c.category_ids.includes(cat.id)) : [];
      }
      if (q.zone) {
        const z = norm(q.zone);
        cards = cards.filter((c) => [c.city, ...c.service_zones].some((v) => norm(v).includes(z)));
      }
      if (q.q) {
        const t = norm(q.q);
        cards = cards.filter((c) =>
          [c.business_name, c.bio, c.city, ...c.specialties, ...c.service_zones, ...c.category_names].some((v) => norm(v).includes(t)),
        );
      }
      res.json({ providers: cards.slice(0, q.limit) });
    }),
  );

  r.get(
    '/providers/:id',
    ah(async (req, res) => {
      const id = idParam(req);
      const [p] = await store.select('provider_profiles', { eq: { id }, limit: 1 });
      const isOwner = p && req.user && p.profile_id === req.user.id;
      const isAdmin = req.user?.role === 'admin';
      if (!p || (p.status !== 'approved' && !isOwner && !isAdmin)) throw notFound('Prestataire introuvable.');

      const [card] = await providerCards(store, [p]);
      const [services, items, cats] = await Promise.all([
        store.select('services', { eq: { provider_id: id, is_active: true } }),
        store.select('portfolio_items', { eq: { provider_id: id, moderation_status: 'approved' }, order: { col: 'created_at', asc: false } }),
        store.select('service_categories'),
      ]);
      const catName = new Map(cats.map((c) => [c.id, c.name]));
      let favorite_id: string | null = null;
      if (req.user) {
        const [f] = await store.select('favorites', { eq: { user_id: req.user.id, provider_id: id }, limit: 1 });
        favorite_id = f?.id ?? null;
      }
      res.json({
        provider: { ...card, image_url: card.image_url ?? (await resolveImage(store, p.cover_url)) },
        services: services.map((s: Row) => ({ ...s, category_name: catName.get(s.category_id) ?? null })),
        portfolio: await withImageUrl(store, items),
        favorite_id,
        is_own: Boolean(isOwner),
      });
    }),
  );

  r.get(
    '/portfolio',
    ah(async (req, res) => {
      const slug = typeof req.query.category === 'string' ? req.query.category : undefined;
      let categoryId: string | undefined;
      if (slug) {
        const [c] = await store.select('service_categories', { eq: { slug }, limit: 1 });
        if (!c) return res.json({ items: [] });
        categoryId = c.id;
      }
      res.json({ items: await publicPortfolio({ categoryId, limit: 60 }) });
    }),
  );

  return r;
}
