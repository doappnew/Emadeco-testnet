import type { Config } from './config.js';
import type { FetchLike } from './lib/pi.js';
import type { Row, Store } from './store/types.js';

export interface Ctx {
  config: Config;
  store: Store;
  fetchImpl?: FetchLike;
}

/** Profil exposé au navigateur (jamais pi_uid). */
export const publicProfile = (p: Row) => ({
  id: p.id as string,
  pi_username: p.pi_username as string,
  display_name: (p.display_name as string | null) ?? null,
  city: (p.city as string | null) ?? null,
  role: p.role as 'client' | 'provider' | 'admin',
  status: p.status as 'active' | 'suspended',
});

export const displayName = (p?: Row | null) => (p ? (p.display_name as string) || (p.pi_username as string) : 'Utilisateur');

/** Chemin d'image → URL : les chemins commençant par « / » sont des ressources statiques de l'application. */
export async function resolveImage(store: Store, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('/') || path.startsWith('https://')) return path;
  return store.fileUrl('portfolio', path);
}

export async function withImageUrl(store: Store, items: Row[]): Promise<Row[]> {
  return Promise.all(
    items.map(async (it) => {
      const { image_path, ...rest } = it;
      return { ...rest, image_url: await resolveImage(store, image_path as string) };
    }),
  );
}

export async function notify(
  store: Store,
  n: { user_id: string; type: string; title: string; body?: string | null; request_id?: string | null },
): Promise<void> {
  await store.insert('notifications', {
    user_id: n.user_id,
    type: n.type,
    title: n.title.slice(0, 120),
    body: n.body ? n.body.slice(0, 400) : null,
    request_id: n.request_id ?? null,
    read_at: null,
  });
}

export async function logAdmin(
  store: Store,
  adminId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await store.insert('admin_logs', {
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata,
  });
}

/** Prestataires visibles publiquement + image de couverture (couverture explicite, sinon 1re réalisation approuvée). */
export async function providerCards(store: Store, providers: Row[]) {
  if (!providers.length) return [];
  const ids = providers.map((p) => p.id);
  const [services, items, cats] = await Promise.all([
    store.select('services', { in: { provider_id: ids }, eq: { is_active: true } }),
    store.select('portfolio_items', { in: { provider_id: ids }, eq: { moderation_status: 'approved' }, order: { col: 'created_at', asc: false } }),
    store.select('service_categories'),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name as string]));
  return Promise.all(
    providers.map(async (p) => {
      const mine = items.filter((i) => i.provider_id === p.id);
      const myServices = services.filter((s) => s.provider_id === p.id);
      const categoryIds = [...new Set([...myServices.map((s) => s.category_id), ...mine.map((i) => i.category_id)].filter(Boolean))];
      return {
        id: p.id as string,
        business_name: p.business_name as string,
        bio: (p.bio as string | null) ?? null,
        specialties: (p.specialties as string[]) ?? [],
        service_zones: (p.service_zones as string[]) ?? [],
        city: (p.city as string | null) ?? null,
        image_url: (await resolveImage(store, p.cover_url)) ?? (mine[0] ? await resolveImage(store, mine[0].image_path) : null),
        portfolio_count: mine.length,
        category_ids: categoryIds as string[],
        category_names: categoryIds.map((id) => catName.get(id as string)).filter(Boolean) as string[],
        status: p.status as string,
      };
    }),
  );
}
