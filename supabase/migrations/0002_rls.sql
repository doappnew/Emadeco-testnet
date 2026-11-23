-- EMADECO — Row Level Security
--
-- Principe : RLS activée sur TOUTES les tables. Le backend Node utilise la clé
-- service_role (qui contourne RLS) et applique en plus ses propres contrôles de
-- rôles. Ces politiques protègent donc toute lecture/écriture directe faite avec
-- la clé anon ou avec un JWT utilisateur : un utilisateur ne peut jamais voir ou
-- modifier les données privées d'un autre.
--
-- Les politiques reposent sur auth.uid() = profiles.id. Aucun accès anonyme aux
-- demandes, messages, notifications, favoris, signalements ou journaux admin.

-- ---------------------------------------------------------------------------
-- Fonctions d'aide (security definer : évitent la récursion de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.my_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid() and status = 'active'), false)
$$;

create or replace function public.my_provider_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.provider_profiles where profile_id = auth.uid()
$$;

create or replace function public.is_request_participant(req uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.service_requests r
    join public.provider_profiles pp on pp.id = r.provider_id
    where r.id = req and (r.client_id = auth.uid() or pp.profile_id = auth.uid())
  )
$$;

revoke all on function public.my_role() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.my_provider_id() from public;
revoke all on function public.is_request_participant(uuid) from public;
grant execute on function public.my_role() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.my_provider_id() to anon, authenticated;
grant execute on function public.is_request_participant(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Activation de RLS
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.service_categories enable row level security;
alter table public.provider_profiles  enable row level security;
alter table public.services           enable row level security;
alter table public.portfolio_items    enable row level security;
alter table public.service_requests   enable row level security;
alter table public.request_messages   enable row level security;
alter table public.favorites          enable row level security;
alter table public.notifications      enable row level security;
alter table public.reports            enable row level security;
alter table public.admin_logs         enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

-- Un utilisateur ne peut changer ni son rôle ni son statut de compte.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and status = (select p.status from public.profiles p where p.id = auth.uid())
  );

create policy profiles_admin_all on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- service_categories : lecture publique des catégories actives
-- ---------------------------------------------------------------------------
create policy categories_public_read on public.service_categories
  for select to anon, authenticated using (is_active or public.is_admin());

create policy categories_admin_write on public.service_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- provider_profiles : seuls les prestataires approuvés sont publics
-- ---------------------------------------------------------------------------
create policy providers_public_read on public.provider_profiles
  for select to anon, authenticated
  using (status = 'approved' or profile_id = auth.uid() or public.is_admin());

-- Création : uniquement pour soi, toujours en attente de validation.
create policy providers_insert_own on public.provider_profiles
  for insert to authenticated
  with check (profile_id = auth.uid() and status = 'pending');

-- Mise à jour : uniquement son profil, sans pouvoir changer son statut de validation.
create policy providers_update_own on public.provider_profiles
  for update to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and status = (select pp.status from public.provider_profiles pp where pp.profile_id = auth.uid())
  );

create policy providers_admin_all on public.provider_profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------
create policy services_public_read on public.services
  for select to anon, authenticated
  using (
    (is_active and exists (select 1 from public.provider_profiles pp where pp.id = provider_id and pp.status = 'approved'))
    or provider_id = public.my_provider_id()
    or public.is_admin()
  );

create policy services_owner_write on public.services
  for all to authenticated
  using (provider_id = public.my_provider_id())
  with check (provider_id = public.my_provider_id());

create policy services_admin_all on public.services
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- portfolio_items : visibles si approuvées ET prestataire approuvé
-- ---------------------------------------------------------------------------
create policy portfolio_public_read on public.portfolio_items
  for select to anon, authenticated
  using (
    (moderation_status = 'approved'
      and exists (select 1 from public.provider_profiles pp where pp.id = provider_id and pp.status = 'approved'))
    or provider_id = public.my_provider_id()
    or public.is_admin()
  );

create policy portfolio_owner_insert on public.portfolio_items
  for insert to authenticated
  with check (provider_id = public.my_provider_id() and moderation_status = 'pending');

create policy portfolio_owner_update on public.portfolio_items
  for update to authenticated
  using (provider_id = public.my_provider_id())
  with check (provider_id = public.my_provider_id() and moderation_status = 'pending');

create policy portfolio_owner_delete on public.portfolio_items
  for delete to authenticated using (provider_id = public.my_provider_id());

create policy portfolio_admin_all on public.portfolio_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- service_requests : privées (client, prestataire concerné, admin)
-- Les changements de statut passent par l'API serveur (pas de politique UPDATE).
-- ---------------------------------------------------------------------------
create policy requests_select_participants on public.service_requests
  for select to authenticated
  using (client_id = auth.uid() or provider_id = public.my_provider_id() or public.is_admin());

create policy requests_insert_client on public.service_requests
  for insert to authenticated
  with check (client_id = auth.uid() and status = 'sent' and public.my_role() is not null);

-- ---------------------------------------------------------------------------
-- request_messages : uniquement les deux participants
-- ---------------------------------------------------------------------------
create policy messages_select_participants on public.request_messages
  for select to authenticated
  using (public.is_request_participant(request_id) or public.is_admin());

create policy messages_insert_participants on public.request_messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_request_participant(request_id));

-- ---------------------------------------------------------------------------
-- favorites : strictement personnels
-- ---------------------------------------------------------------------------
create policy favorites_own on public.favorites
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notifications : lecture et marquage « lu » par le propriétaire ; création par le serveur
-- ---------------------------------------------------------------------------
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open');

create policy reports_select_own on public.reports
  for select to authenticated using (reporter_id = auth.uid() or public.is_admin());

create policy reports_admin_update on public.reports
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- admin_logs : lecture réservée aux administrateurs ; écriture par le serveur uniquement
-- ---------------------------------------------------------------------------
create policy admin_logs_select_admin on public.admin_logs
  for select to authenticated using (public.is_admin());
