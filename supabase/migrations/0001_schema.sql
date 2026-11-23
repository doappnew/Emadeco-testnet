-- EMADECO — schéma de base de données (PostgreSQL / Supabase)
-- Aucune colonne financière : ni montant, ni tarif, ni fourchette, ni devis.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types énumérés
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('client', 'provider', 'admin');
create type public.account_status as enum ('active', 'suspended');
create type public.provider_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.moderation_status as enum ('pending', 'approved', 'rejected');
create type public.request_status as enum (
  'sent',            -- envoyée
  'in_review',       -- en cours d'examen
  'info_requested',  -- informations complémentaires demandées
  'response_received', -- réponse reçue
  'confirmed',       -- confirmée
  'declined',        -- refusée
  'closed'           -- clôturée
);
create type public.report_status as enum ('open', 'reviewed', 'dismissed', 'actioned');
create type public.report_target as enum ('provider', 'portfolio_item', 'user', 'request');

-- ---------------------------------------------------------------------------
-- Fonction utilitaire : updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles : un profil par utilisateur Pi
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key default gen_random_uuid(),
  pi_uid        text not null unique check (char_length(pi_uid) between 1 and 128),
  pi_username   text not null check (char_length(pi_username) between 1 and 64),
  display_name  text check (display_name is null or char_length(display_name) <= 80),
  avatar_url    text check (avatar_url is null or char_length(avatar_url) <= 500),
  city          text check (city is null or char_length(city) <= 80),
  role          public.user_role not null default 'client',
  status        public.account_status not null default 'active',
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- service_categories
-- ---------------------------------------------------------------------------
create table public.service_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (char_length(name) between 2 and 80),
  description text check (description is null or char_length(description) <= 400),
  image_url   text check (image_url is null or char_length(image_url) <= 500),
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index service_categories_sort_idx on public.service_categories (sort_order);

-- ---------------------------------------------------------------------------
-- provider_profiles
-- ---------------------------------------------------------------------------
create table public.provider_profiles (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null unique references public.profiles(id) on delete cascade,
  business_name text not null check (char_length(business_name) between 2 and 100),
  bio           text check (bio is null or char_length(bio) <= 2000),
  specialties   text[] not null default '{}' check (cardinality(specialties) <= 12),
  service_zones text[] not null default '{}' check (cardinality(service_zones) <= 20),
  city          text check (city is null or char_length(city) <= 80),
  cover_url     text check (cover_url is null or char_length(cover_url) <= 500),
  status        public.provider_status not null default 'pending',
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index provider_profiles_status_idx on public.provider_profiles (status);
create index provider_profiles_zones_idx on public.provider_profiles using gin (service_zones);
create index provider_profiles_specialties_idx on public.provider_profiles using gin (specialties);
create trigger provider_profiles_updated before update on public.provider_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- services : prestations proposées (description uniquement)
-- ---------------------------------------------------------------------------
create table public.services (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  category_id uuid not null references public.service_categories(id) on delete restrict,
  title       text not null check (char_length(title) between 2 and 120),
  description text check (description is null or char_length(description) <= 1500),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index services_provider_idx on public.services (provider_id);
create index services_category_idx on public.services (category_id);
create trigger services_updated before update on public.services
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- portfolio_items : réalisations (photos)
-- ---------------------------------------------------------------------------
create table public.portfolio_items (
  id                uuid primary key default gen_random_uuid(),
  provider_id       uuid not null references public.provider_profiles(id) on delete cascade,
  category_id       uuid references public.service_categories(id) on delete set null,
  title             text not null check (char_length(title) between 2 and 120),
  description       text check (description is null or char_length(description) <= 1000),
  image_path        text not null check (char_length(image_path) <= 300),
  moderation_status public.moderation_status not null default 'pending',
  created_at        timestamptz not null default now()
);
create index portfolio_provider_idx on public.portfolio_items (provider_id);
create index portfolio_category_idx on public.portfolio_items (category_id);
create index portfolio_moderation_idx on public.portfolio_items (moderation_status);

-- ---------------------------------------------------------------------------
-- service_requests : demandes de prestation (sans aucun champ financier)
-- ---------------------------------------------------------------------------
create table public.service_requests (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.profiles(id) on delete cascade,
  provider_id        uuid not null references public.provider_profiles(id) on delete cascade,
  category_id        uuid references public.service_categories(id) on delete set null,
  service_id         uuid references public.services(id) on delete set null,
  event_type         text not null check (char_length(event_type) between 2 and 60),
  event_date         date not null,
  event_location     text not null check (char_length(event_location) between 2 and 200),
  guests_approx      int check (guests_approx is null or guests_approx between 1 and 100000),
  theme              text check (theme is null or char_length(theme) <= 120),
  colors             text check (colors is null or char_length(colors) <= 120),
  requested_services text check (requested_services is null or char_length(requested_services) <= 600),
  details            text check (details is null or char_length(details) <= 2000),
  inspiration_paths  text[] not null default '{}' check (cardinality(inspiration_paths) <= 5),
  status             public.request_status not null default 'sent',
  status_note        text check (status_note is null or char_length(status_note) <= 500),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index requests_client_idx on public.service_requests (client_id, created_at desc);
create index requests_provider_idx on public.service_requests (provider_id, created_at desc);
create index requests_status_idx on public.service_requests (status);
create trigger service_requests_updated before update on public.service_requests
  for each row execute function public.set_updated_at();

-- Transitions de statut autorisées (défense en profondeur : le serveur contrôle aussi l'acteur)
create or replace function public.request_transition_allowed(old_s public.request_status, new_s public.request_status)
returns boolean language sql immutable as $$
  select case old_s
    when 'sent'              then new_s in ('in_review','info_requested','declined','closed')
    when 'in_review'         then new_s in ('info_requested','confirmed','declined','closed')
    when 'info_requested'    then new_s in ('response_received','declined','closed')
    when 'response_received' then new_s in ('in_review','info_requested','confirmed','declined','closed')
    when 'confirmed'         then new_s in ('closed')
    when 'declined'          then new_s in ('closed')
    when 'closed'            then false
  end
$$;

create or replace function public.enforce_request_transition()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status
     and not public.request_transition_allowed(old.status, new.status) then
    raise exception 'Transition de statut interdite : % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger service_requests_transition before update on public.service_requests
  for each row execute function public.enforce_request_transition();

-- ---------------------------------------------------------------------------
-- request_messages
-- ---------------------------------------------------------------------------
create table public.request_messages (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index request_messages_req_idx on public.request_messages (request_id, created_at);

-- ---------------------------------------------------------------------------
-- favorites : prestataires OU réalisations
-- ---------------------------------------------------------------------------
create table public.favorites (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  provider_id       uuid references public.provider_profiles(id) on delete cascade,
  portfolio_item_id uuid references public.portfolio_items(id) on delete cascade,
  created_at        timestamptz not null default now(),
  constraint favorites_one_target check (num_nonnulls(provider_id, portfolio_item_id) = 1)
);
create unique index favorites_user_provider_uq on public.favorites (user_id, provider_id) where provider_id is not null;
create unique index favorites_user_item_uq on public.favorites (user_id, portfolio_item_id) where portfolio_item_id is not null;

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null check (type in ('request_new','request_status','message_new','provider_review','moderation','system')),
  title      text not null check (char_length(title) <= 120),
  body       text check (body is null or char_length(body) <= 400),
  request_id uuid references public.service_requests(id) on delete cascade,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- reports : signalements
-- ---------------------------------------------------------------------------
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type public.report_target not null,
  target_id   uuid not null,
  reason      text not null check (char_length(reason) between 3 and 120),
  details     text check (details is null or char_length(details) <= 1000),
  status      public.report_status not null default 'open',
  handled_by  uuid references public.profiles(id) on delete set null,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index reports_status_idx on public.reports (status, created_at desc);

-- ---------------------------------------------------------------------------
-- admin_logs : journal des actions administratives
-- ---------------------------------------------------------------------------
create table public.admin_logs (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references public.profiles(id) on delete set null,
  action      text not null check (char_length(action) <= 80),
  target_type text check (target_type is null or char_length(target_type) <= 40),
  target_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index admin_logs_created_idx on public.admin_logs (created_at desc);
