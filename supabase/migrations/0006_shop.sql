-- EMADECO — boutique : produits (prix de test en Pi) et commandes.
-- Les montants sont décidés par le serveur ; le navigateur n'envoie jamais de prix.

create type public.order_status as enum ('awaiting_payment', 'paid', 'preparing', 'delivered', 'cancelled');

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid references public.service_categories(id) on delete set null,
  title       text not null check (char_length(title) between 2 and 120),
  description text check (description is null or char_length(description) <= 1500),
  image_path  text check (image_path is null or char_length(image_path) <= 300),
  price_pi    numeric(14,4) not null check (price_pi > 0 and price_pi <= 100000),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);
create index products_active_idx on public.products (is_active, sort_order);
create trigger products_updated before update on public.products
  for each row execute function public.set_updated_at();

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.profiles(id) on delete restrict,
  product_id     uuid references public.products(id) on delete set null,
  product_title  text not null,
  product_image  text,
  quantity       int not null check (quantity between 1 and 50),
  unit_price_pi  numeric(14,4) not null check (unit_price_pi > 0),
  total_pi       numeric(14,4) not null check (total_pi > 0),
  recipient_name text not null check (char_length(recipient_name) between 2 and 80),
  phone          text not null check (char_length(phone) between 6 and 30),
  country        text not null check (char_length(country) between 2 and 60),
  city           text not null check (char_length(city) between 2 and 80),
  address        text not null check (char_length(address) between 5 and 200),
  landmark       text check (landmark is null or char_length(landmark) <= 150),
  notes          text check (notes is null or char_length(notes) <= 500),
  status         public.order_status not null default 'awaiting_payment',
  pi_payment_id  text unique,
  pi_txid        text,
  paid_at        timestamptz,
  admin_note     text check (admin_note is null or char_length(admin_note) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index orders_client_idx on public.orders (client_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create trigger orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.orders   enable row level security;

-- Produits : lecture publique des produits actifs ; écriture réservée aux administrateurs.
create policy products_public_read on public.products
  for select to anon, authenticated using (is_active or public.is_admin());
create policy products_admin_all on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Commandes : chacun voit les siennes (et l'admin toutes). Création et paiement : serveur uniquement.
create policy orders_select_own on public.orders
  for select to authenticated using (client_id = auth.uid() or public.is_admin());
