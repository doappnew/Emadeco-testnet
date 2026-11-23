-- EMADECO — DONNÉES DE DÉMONSTRATION (FICTIVES)
-- À exécuter uniquement sur un environnement de test. Ces prestataires n'existent pas :
-- leurs comptes (pi_uid « demo-… ») ne peuvent pas se connecter. Ils servent à
-- remplir les écrans (Explorer, profils, réalisations). Aucun tarif, aucun budget.

insert into public.profiles (id, pi_uid, pi_username, display_name, role, city, is_demo) values
  ('00000000-0000-4000-8000-0000000000a1', 'demo-001', 'demo_elegance',  'Élégance Déco (démo)',     'provider', 'Cotonou',    true),
  ('00000000-0000-4000-8000-0000000000a2', 'demo-002', 'demo_ambiance',  'Ambiance Chic (démo)',     'provider', 'Porto-Novo', true),
  ('00000000-0000-4000-8000-0000000000a3', 'demo-003', 'demo_reve',      'Rêve & Couleurs (démo)',   'provider', 'Abomey-Calavi', true),
  ('00000000-0000-4000-8000-0000000000a4', 'demo-004', 'demo_events',    'Fleur d''Événement (démo)', 'provider', 'Cotonou',    true)
on conflict (pi_uid) do nothing;

insert into public.provider_profiles (id, profile_id, business_name, bio, specialties, service_zones, city, cover_url, status, is_demo) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
   'Élégance Déco (démo)',
   'Profil fictif de démonstration. Décoration de mariages et de salles de réception : arches florales, drapés, tables d''honneur.',
   array['Mariages','Salles de réception','Arches florales'], array['Cotonou','Abomey-Calavi','Ouidah'], 'Cotonou', '/img/cat-mariages.webp', 'approved', true),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a2',
   'Ambiance Chic (démo)',
   'Profil fictif de démonstration. Événements corporatifs, lancements de produits et soirées de gala.',
   array['Événements corporatifs','Gala','Éclairage'], array['Porto-Novo','Cotonou','Sèmè-Podji'], 'Porto-Novo', '/img/cat-evenements-corporatifs.webp', 'approved', true),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a3',
   'Rêve & Couleurs (démo)',
   'Profil fictif de démonstration. Anniversaires, baby showers et arches de ballons.',
   array['Anniversaires','Baby showers','Ballons'], array['Abomey-Calavi','Cotonou'], 'Abomey-Calavi', '/img/cat-anniversaires.webp', 'approved', true),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000a4',
   'Fleur d''Événement (démo)',
   'Profil fictif de démonstration. Location de matériel décoratif, tentes et décoration de voitures de cortège.',
   array['Location de matériel','Tentes','Voitures'], array['Cotonou','Porto-Novo','Parakou'], 'Cotonou', '/img/cat-location-materiel.webp', 'approved', true)
on conflict (profile_id) do nothing;

insert into public.services (provider_id, category_id, title, description)
select v.provider_id::uuid, c.id, v.title, v.descr
from (values
  ('00000000-0000-4000-8000-0000000000b1', 'mariages-ceremonies',    'Décoration complète de mariage', 'Cérémonie, salle, scène des mariés et espace photo.'),
  ('00000000-0000-4000-8000-0000000000b1', 'ambiances-personnalisees','Ambiance sur mesure',           'Thème, couleurs et lieu définis avec vous.'),
  ('00000000-0000-4000-8000-0000000000b2', 'evenements-corporatifs', 'Conférences et séminaires',      'Scène, écrans, mise en lumière et habillage de salle.'),
  ('00000000-0000-4000-8000-0000000000b2', 'soirees-gala',           'Soirée de gala',                 'Tables, centres de table et éclairage d''ambiance.'),
  ('00000000-0000-4000-8000-0000000000b3', 'anniversaires-fetes',    'Anniversaire décoré',            'Arche de ballons, table gâteau et fond photo.'),
  ('00000000-0000-4000-8000-0000000000b3', 'baby-showers-baptemes',  'Baby shower & baptême',          'Palette douce, peluches et dressing de table.'),
  ('00000000-0000-4000-8000-0000000000b4', 'location-materiel',      'Location de matériel',           'Chaises, tables, nappes, vaisselle et structures.'),
  ('00000000-0000-4000-8000-0000000000b4', 'decoration-voitures',    'Voiture de cortège',             'Décoration florale ou rubanée du véhicule.')
) as v(provider_id, cat_slug, title, descr)
join public.service_categories c on c.slug = v.cat_slug
where not exists (select 1 from public.services s where s.provider_id = v.provider_id::uuid and s.title = v.title);

insert into public.portfolio_items (provider_id, category_id, title, description, image_path, moderation_status)
select v.provider_id::uuid, c.id, v.title, v.descr, v.img, 'approved'
from (values
  ('00000000-0000-4000-8000-0000000000b1', 'mariages-ceremonies',    'Cérémonie élégante',     'Allée fleurie et arche blanche.',          '/img/work-mariage-1.webp'),
  ('00000000-0000-4000-8000-0000000000b1', 'mariages-ceremonies',    'Salle de réception',     'Lustres, drapés et tables rondes.',        '/img/work-mariage-2.webp'),
  ('00000000-0000-4000-8000-0000000000b1', 'mariages-ceremonies',    'Table d''honneur',       'Roses, bougies et fond en voile.',         '/img/work-mariage-3.webp'),
  ('00000000-0000-4000-8000-0000000000b2', 'evenements-corporatifs', 'Conférence',             'Salle en rangs, scène et écran.',          '/img/work-corporate-1.webp'),
  ('00000000-0000-4000-8000-0000000000b2', 'evenements-corporatifs', 'Lancement de produit',   'Scène éclairée en vert.',                  '/img/work-corporate-2.webp'),
  ('00000000-0000-4000-8000-0000000000b2', 'soirees-gala',           'Dîner de gala',          'Nappes dorées et mise en lumière.',        '/img/work-corporate-3.webp'),
  ('00000000-0000-4000-8000-0000000000b3', 'anniversaires-fetes',    'Happy Birthday doré',    'Arche de ballons or et blanc.',            '/img/work-anniversaire-1.webp'),
  ('00000000-0000-4000-8000-0000000000b3', 'baby-showers-baptemes',  'Thème rose poudré',      'Arche de ballons et peluches.',            '/img/work-anniversaire-2.webp'),
  ('00000000-0000-4000-8000-0000000000b3', 'anniversaires-fetes',    'Bleu et or',             'Fond bleu nuit et table sucrée.',          '/img/work-anniversaire-3.webp'),
  ('00000000-0000-4000-8000-0000000000b4', 'decoration-voitures',    'Cortège classique',      'Bouquet blanc sur voiture claire.',        '/img/work-voiture-1.webp'),
  ('00000000-0000-4000-8000-0000000000b4', 'decoration-voitures',    'Ruban rouge',            'Voiture noire et rubans rouges.',          '/img/work-voiture-2.webp'),
  ('00000000-0000-4000-8000-0000000000b4', 'decoration-voitures',    'Fleurs ivoire',          'Composition florale ivoire.',              '/img/work-voiture-3.webp'),
  ('00000000-0000-4000-8000-0000000000b1', 'decoration-maisons',     'Salon chaleureux',       'Ambiance feutrée et lumières chaudes.',    '/img/work-maison-1.webp'),
  ('00000000-0000-4000-8000-0000000000b4', 'decoration-maisons',     'Salle à manger',         'Table dressée et plantes.',                '/img/work-maison-2.webp'),
  ('00000000-0000-4000-8000-0000000000b1', 'ambiances-personnalisees','Thème rose et lustres',  'Voilages roses et table centrale.',        '/img/work-theme-1.webp'),
  ('00000000-0000-4000-8000-0000000000b3', 'ambiances-personnalisees','Thème forêt enchantée',  'Verdure, bois et guirlandes.',             '/img/work-theme-2.webp')
) as v(provider_id, cat_slug, title, descr, img)
join public.service_categories c on c.slug = v.cat_slug
where not exists (select 1 from public.portfolio_items p where p.provider_id = v.provider_id::uuid and p.title = v.title);
