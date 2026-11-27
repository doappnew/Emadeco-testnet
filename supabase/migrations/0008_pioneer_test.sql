-- EMADECO — test de paiement Testnet des 5 pionniers.
-- Accès serveur uniquement : RLS activé, AUCUNE politique (la clé service du serveur contourne la RLS).
-- Un pionnier est « validé » (paid_ok) quand le serveur a vérifié son paiement auprès de l'API Pi.

create table public.pioneer_test (
  profile_id   uuid primary key references public.profiles(id) on delete cascade,
  login_ok     boolean not null default true,
  paid_ok      boolean not null default false,
  order_id     uuid null,
  validated_at timestamptz null,
  created_at   timestamptz not null default now()
);
create index pioneer_test_validated_idx on public.pioneer_test (validated_at) where paid_ok;

alter table public.pioneer_test enable row level security;

-- Plafond de 5 comptes validés, garanti par la base même en cas de requêtes simultanées.
create or replace function public.pioneer_test_cap() returns trigger
language plpgsql as $$
begin
  if new.paid_ok then
    perform pg_advisory_xact_lock(80808);
    if (select count(*) from public.pioneer_test where paid_ok and profile_id <> new.profile_id) >= 5 then
      raise exception 'pioneer_cap_reached' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger pioneer_test_cap_trg before insert or update on public.pioneer_test
  for each row execute function public.pioneer_test_cap();
