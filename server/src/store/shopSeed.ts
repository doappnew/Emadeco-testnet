import type { Store } from './types.js';

/** Produits de démonstration (mémoire uniquement). En production, ils viennent de la migration 0007. */
export async function seedProducts(store: Store): Promise<void> {
  const cats = await store.select('service_categories');
  const by = (slug: string) => cats.find((c) => c.slug === slug)?.id ?? null;
  await store.insert('products', [
    { category_id: by('mariages-ceremonies'), title: 'Arche de cérémonie drapée', description: 'Arche en voilages ivoire ornée de fleurs blanches.', image_path: '/img/shop/p09.webp', price_pi: 0.85, is_active: true, sort_order: 10 },
    { category_id: by('anniversaires-fetes'), title: 'Guirlande de ballons or rose', description: 'Arche de ballons et table de fête.', image_path: '/img/shop/p15.webp', price_pi: 0.3, is_active: true, sort_order: 20 },
    { category_id: by('decoration-voitures'), title: 'Voiture de mariage bordeaux', description: 'Bouquet et rubans pour voiture de cortège.', image_path: '/img/shop/p24.webp', price_pi: 0.4, is_active: true, sort_order: 30 },
    { category_id: by('tentes-structures'), title: 'Produit retiré (démo)', description: 'Produit inactif, invisible des clients.', image_path: '/img/shop/p27.webp', price_pi: 1.2, is_active: false, sort_order: 40 },
  ]);
}
