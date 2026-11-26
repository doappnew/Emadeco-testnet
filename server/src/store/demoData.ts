import { seedProducts } from './shopSeed.js';
import type { Store } from './types.js';

/** Catégories de référence (miroir de supabase/migrations/0004_categories.sql). */
export const CATEGORIES = [
  ['mariages-ceremonies', 'Mariages & cérémonies', 'Cérémonie, salle de réception, scène des mariés, table d’honneur et espace photo.', '/img/cat-mariages.webp'],
  ['anniversaires-fetes', 'Anniversaires & fêtes privées', 'Anniversaires, fêtes de famille et célébrations sur mesure.', '/img/cat-anniversaires.webp'],
  ['baby-showers-baptemes', 'Baby showers & baptêmes', 'Ambiances douces et élégantes pour accueillir bébé.', '/img/cat-baby-showers.webp'],
  ['evenements-corporatifs', 'Événements corporatifs', 'Conférences, séminaires, lancements de produits et cérémonies institutionnelles.', '/img/cat-evenements-corporatifs.webp'],
  ['soirees-gala', 'Soirées & gala', 'Soirées de prestige, dîners de gala et réceptions.', '/img/cat-soirees-gala.webp'],
  ['location-materiel', 'Location de matériel décoratif', 'Chaises, tables, nappes, vaisselle, structures, arches et accessoires à louer.', '/img/cat-location-materiel.webp'],
  ['tentes-structures', 'Tentes & structures', 'Tentes, chapiteaux et structures pour vos événements en extérieur.', '/img/cat-tentes-structures.webp'],
  ['decoration-voitures', 'Décoration de voitures', 'Voitures de cortège et décorations florales ou rubanées.', '/img/cat-voitures-mariage.webp'],
  ['decoration-maisons', 'Décoration de maisons', 'Salons, chambres, terrasses et espaces intérieurs ou extérieurs.', '/img/cat-maisons-interieur.webp'],
  ['ambiances-personnalisees', 'Ambiances & thèmes personnalisés', 'Thèmes tropical, bohème, traditionnel, moderne ou champêtre : créés selon vos envies.', '/img/cat-ambiances-personnalisees.webp'],
] as const;

const P = (n: number) => `00000000-0000-4000-8000-0000000000a${n}`;
const B = (n: number) => `00000000-0000-4000-8000-0000000000b${n}`;

export const DEMO_IDS = {
  client: '00000000-0000-4000-8000-0000000000c1',
  admin: '00000000-0000-4000-8000-0000000000c2',
  providerProfile: P(1),
  provider: B(1),
};

export async function seedCategories(store: Store): Promise<void> {
  await store.insert(
    'service_categories',
    CATEGORIES.map(([slug, name, description, image_url], i) => ({
      slug,
      name,
      description,
      image_url,
      sort_order: (i + 1) * 10,
      is_active: true,
    })),
  );
}

/** Données fictives, clairement signalées « démo ». Aucun tarif ni budget. */
export async function seedDemo(store: Store): Promise<void> {
  const now = new Date().toISOString();
  await store.insert('profiles', [
    { id: DEMO_IDS.client, pi_uid: 'demo-client', pi_username: 'demo_client', display_name: 'Client Démo', role: 'client', status: 'active', city: 'Cotonou', is_demo: true, updated_at: now },
    { id: DEMO_IDS.admin, pi_uid: 'demo-admin', pi_username: 'demo_admin', display_name: 'Admin Démo', role: 'admin', status: 'active', is_demo: true, updated_at: now },
    { id: P(1), pi_uid: 'demo-001', pi_username: 'demo_elegance', display_name: 'Élégance Déco (démo)', role: 'provider', status: 'active', city: 'Cotonou', is_demo: true, updated_at: now },
    { id: P(2), pi_uid: 'demo-002', pi_username: 'demo_ambiance', display_name: 'Ambiance Chic (démo)', role: 'provider', status: 'active', city: 'Porto-Novo', is_demo: true, updated_at: now },
    { id: P(3), pi_uid: 'demo-003', pi_username: 'demo_reve', display_name: 'Rêve & Couleurs (démo)', role: 'provider', status: 'active', city: 'Abomey-Calavi', is_demo: true, updated_at: now },
    { id: P(4), pi_uid: 'demo-004', pi_username: 'demo_events', display_name: 'Fleur d’Événement (démo)', role: 'provider', status: 'active', city: 'Cotonou', is_demo: true, updated_at: now },
  ]);

  const providers = [
    [1, 'Élégance Déco (démo)', 'Profil fictif de démonstration. Décoration de mariages et de salles de réception : arches florales, drapés, tables d’honneur.', ['Mariages', 'Salles de réception', 'Arches florales'], ['Cotonou', 'Abomey-Calavi', 'Ouidah'], 'Cotonou', '/img/cat-mariages.webp'],
    [2, 'Ambiance Chic (démo)', 'Profil fictif de démonstration. Événements corporatifs, lancements de produits et soirées de gala.', ['Événements corporatifs', 'Gala', 'Éclairage'], ['Porto-Novo', 'Cotonou', 'Sèmè-Podji'], 'Porto-Novo', '/img/cat-evenements-corporatifs.webp'],
    [3, 'Rêve & Couleurs (démo)', 'Profil fictif de démonstration. Anniversaires, baby showers et arches de ballons.', ['Anniversaires', 'Baby showers', 'Ballons'], ['Abomey-Calavi', 'Cotonou'], 'Abomey-Calavi', '/img/cat-anniversaires.webp'],
    [4, 'Fleur d’Événement (démo)', 'Profil fictif de démonstration. Location de matériel décoratif, tentes et décoration de voitures de cortège.', ['Location de matériel', 'Tentes', 'Voitures'], ['Cotonou', 'Porto-Novo', 'Parakou'], 'Cotonou', '/img/cat-location-materiel.webp'],
  ] as const;
  await store.insert(
    'provider_profiles',
    providers.map(([n, business_name, bio, specialties, service_zones, city, cover_url]) => ({
      id: B(n),
      profile_id: P(n),
      business_name,
      bio,
      specialties: [...specialties],
      service_zones: [...service_zones],
      city,
      cover_url,
      status: 'approved',
      is_demo: true,
      updated_at: now,
    })),
  );

  const cats = await store.select('service_categories');
  const cat = (slug: string) => cats.find((c) => c.slug === slug)!.id as string;

  await store.insert('services', (
    [
      [1, 'mariages-ceremonies', 'Décoration complète de mariage', 'Cérémonie, salle, scène des mariés et espace photo.'],
      [1, 'ambiances-personnalisees', 'Ambiance sur mesure', 'Thème, couleurs et lieu définis avec vous.'],
      [2, 'evenements-corporatifs', 'Conférences et séminaires', 'Scène, écrans, mise en lumière et habillage de salle.'],
      [2, 'soirees-gala', 'Soirée de gala', 'Tables, centres de table et éclairage d’ambiance.'],
      [3, 'anniversaires-fetes', 'Anniversaire décoré', 'Arche de ballons, table gâteau et fond photo.'],
      [3, 'baby-showers-baptemes', 'Baby shower & baptême', 'Palette douce, peluches et dressing de table.'],
      [4, 'location-materiel', 'Location de matériel', 'Chaises, tables, nappes, vaisselle et structures.'],
      [4, 'decoration-voitures', 'Voiture de cortège', 'Décoration florale ou rubanée du véhicule.'],
    ] as const
  ).map(([n, slug, title, description]) => ({ provider_id: B(n), category_id: cat(slug), title, description, is_active: true, updated_at: now })));

  await store.insert('portfolio_items', (
    [
      [1, 'mariages-ceremonies', 'Cérémonie élégante', 'Allée fleurie et arche blanche.', 'work-mariage-1'],
      [1, 'mariages-ceremonies', 'Salle de réception', 'Lustres, drapés et tables rondes.', 'work-mariage-2'],
      [1, 'mariages-ceremonies', 'Table d’honneur', 'Roses, bougies et fond en voile.', 'work-mariage-3'],
      [2, 'evenements-corporatifs', 'Conférence', 'Salle en rangs, scène et écran.', 'work-corporate-1'],
      [2, 'evenements-corporatifs', 'Lancement de produit', 'Scène éclairée en vert.', 'work-corporate-2'],
      [2, 'soirees-gala', 'Dîner de gala', 'Nappes dorées et mise en lumière.', 'work-corporate-3'],
      [3, 'anniversaires-fetes', 'Happy Birthday doré', 'Arche de ballons or et blanc.', 'work-anniversaire-1'],
      [3, 'baby-showers-baptemes', 'Thème rose poudré', 'Arche de ballons et peluches.', 'work-anniversaire-2'],
      [3, 'anniversaires-fetes', 'Bleu et or', 'Fond bleu nuit et table sucrée.', 'work-anniversaire-3'],
      [4, 'decoration-voitures', 'Cortège classique', 'Bouquet blanc sur voiture claire.', 'work-voiture-1'],
      [4, 'decoration-voitures', 'Ruban rouge', 'Voiture noire et rubans rouges.', 'work-voiture-2'],
      [4, 'decoration-voitures', 'Fleurs ivoire', 'Composition florale ivoire.', 'work-voiture-3'],
      [1, 'decoration-maisons', 'Salon chaleureux', 'Ambiance feutrée et lumières chaudes.', 'work-maison-1'],
      [4, 'decoration-maisons', 'Salle à manger', 'Table dressée et plantes.', 'work-maison-2'],
      [1, 'ambiances-personnalisees', 'Thème rose et lustres', 'Voilages roses et table centrale.', 'work-theme-1'],
      [3, 'ambiances-personnalisees', 'Thème forêt enchantée', 'Verdure, bois et guirlandes.', 'work-theme-2'],
    ] as const
  ).map(([n, slug, title, description, img], i) => ({
    provider_id: B(n),
    category_id: cat(slug),
    title,
    description,
    image_path: `/img/${img}.webp`,
    moderation_status: 'approved',
    created_at: new Date(Date.now() - i * 3600_000).toISOString(),
  })));
  await seedProducts(store);
}
