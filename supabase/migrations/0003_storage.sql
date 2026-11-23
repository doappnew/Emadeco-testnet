-- EMADECO — buckets de stockage
-- Les envois passent par le backend (contrôle du type, de la taille et du contenu).
-- Aucune politique d'écriture n'est créée sur storage.objects : seul le serveur
-- (clé service_role) peut déposer ou supprimer des fichiers.

-- Réalisations des prestataires : lecture publique (les fichiers sont servis via
-- des chemins aléatoires ; la modération se fait côté base).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio', 'portfolio', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Photos d'inspiration des clients : privées, accessibles via URL signée courte
-- générée par le serveur pour les participants de la demande.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspiration', 'inspiration', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
