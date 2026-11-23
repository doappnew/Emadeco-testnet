-- EMADECO — catégories de services de référence (données de configuration, pas de démo)
insert into public.service_categories (slug, name, description, image_url, sort_order) values
  ('mariages-ceremonies',      'Mariages & cérémonies',            'Cérémonie, salle de réception, scène des mariés, table d''honneur et espace photo.', '/img/cat-mariages.webp', 10),
  ('anniversaires-fetes',      'Anniversaires & fêtes privées',    'Anniversaires, fêtes de famille et célébrations sur mesure.',                        '/img/cat-anniversaires.webp', 20),
  ('baby-showers-baptemes',    'Baby showers & baptêmes',          'Ambiances douces et élégantes pour accueillir bébé.',                                 '/img/cat-baby-showers.webp', 30),
  ('evenements-corporatifs',   'Événements corporatifs',           'Conférences, séminaires, lancements de produits et cérémonies institutionnelles.',    '/img/cat-evenements-corporatifs.webp', 40),
  ('soirees-gala',             'Soirées & gala',                   'Soirées de prestige, dîners de gala et réceptions.',                                  '/img/cat-soirees-gala.webp', 50),
  ('location-materiel',        'Location de matériel décoratif',   'Chaises, tables, nappes, vaisselle, structures, arches et accessoires à louer.',      '/img/cat-location-materiel.webp', 60),
  ('tentes-structures',        'Tentes & structures',              'Tentes, chapiteaux et structures pour vos événements en extérieur.',                  '/img/cat-tentes-structures.webp', 70),
  ('decoration-voitures',      'Décoration de voitures',           'Voitures de cortège et décorations florales ou rubanées.',                            '/img/cat-voitures-mariage.webp', 80),
  ('decoration-maisons',       'Décoration de maisons',            'Salons, chambres, terrasses et espaces intérieurs ou extérieurs.',                    '/img/cat-maisons-interieur.webp', 90),
  ('ambiances-personnalisees', 'Ambiances & thèmes personnalisés', 'Thèmes tropical, bohème, traditionnel, moderne ou champêtre : créés selon vos envies.', '/img/cat-ambiances-personnalisees.webp', 100)
on conflict (slug) do nothing;
