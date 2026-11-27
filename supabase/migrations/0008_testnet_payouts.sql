-- EMADECO — test de réception Testnet (A2U : application → utilisateur), limité à 5 pionniers.
-- Accès serveur uniquement : RLS activé, AUCUNE politique (la clé service du serveur contourne la RLS).
-- Remplace l'ancienne table pioneer_test (plafond mal placé sur le paiement U2A) : supprimée si elle existe.

drop trigger if exists pioneer_test_cap_trg on public.pioneer_test;
drop function if exists public.pioneer_test_cap();
drop table if exists public.pioneer_test;

create table public.testnet_payouts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,  -- un seul envoi par compte
  amount     numeric(20,7),
  payment_id text,
  txid       text,
  status     text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now()
);
create unique index testnet_payouts_payment_id_key on public.testnet_payouts (payment_id) where payment_id is not null;
alter table public.testnet_payouts enable row level security;

-- Plafond de 5 comptes (statut ≠ failed), garanti par la base même en cas de requêtes simultanées.
create or replace function public.testnet_payouts_cap() returns trigger
language plpgsql as $$
begin
  if new.status <> 'failed' then
    perform pg_advisory_xact_lock(80809);
    if (select count(*) from public.testnet_payouts where status <> 'failed' and profile_id <> new.profile_id) >= 5 then
      raise exception 'payout_cap_reached' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger testnet_payouts_cap_trg before insert or update on public.testnet_payouts
  for each row execute function public.testnet_payouts_cap();

-- Réglages de l'application (ex. clôture du test de réception par l'administrateur).
create table public.app_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
