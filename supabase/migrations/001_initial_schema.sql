-- ============================================================
-- Raízes Brasileiras — Schema inicial
-- ============================================================

-- Extensões
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------
-- Perfis de usuário (admin, garçom, cozinha)
-- ---------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  role text not null check (role in ('admin','waiter','kitchen')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "profiles_self" on profiles for select using (auth.uid() = id);
create policy "profiles_admin" on profiles for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ---------------------------------------------------------------
-- Categorias do cardápio
-- ---------------------------------------------------------------
create table categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  image_url text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table categories enable row level security;
create policy "categories_read_all" on categories for select using (true);
create policy "categories_write_admin" on categories for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ---------------------------------------------------------------
-- Produtos / cardápio
-- ---------------------------------------------------------------
create table products (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(10,2) not null,
  image_url text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table products enable row level security;
create policy "products_read_all" on products for select using (true);
create policy "products_write_admin" on products for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ---------------------------------------------------------------
-- Ingredientes / estoque
-- ---------------------------------------------------------------
create table ingredients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  unit text not null default 'un',
  quantity numeric(12,3) not null default 0,
  min_quantity numeric(12,3) not null default 0,
  cost_per_unit numeric(10,4) not null default 0,
  created_at timestamptz not null default now()
);
alter table ingredients enable row level security;
create policy "ingredients_admin" on ingredients for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Vínculo produto ↔ ingrediente
create table product_ingredients (
  product_id uuid references products(id) on delete cascade,
  ingredient_id uuid references ingredients(id) on delete cascade,
  quantity numeric(12,3) not null default 0,
  primary key (product_id, ingredient_id)
);
alter table product_ingredients enable row level security;
create policy "pi_admin" on product_ingredients for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Movimentos de estoque
create table stock_movements (
  id uuid primary key default uuid_generate_v4(),
  ingredient_id uuid references ingredients(id) on delete cascade,
  type text not null check (type in ('in','out','adjustment')),
  quantity numeric(12,3) not null,
  reason text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
alter table stock_movements enable row level security;
create policy "sm_admin" on stock_movements for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ---------------------------------------------------------------
-- Mesas / tabs
-- ---------------------------------------------------------------
create table tables (
  id uuid primary key default uuid_generate_v4(),
  number int not null unique,
  capacity int not null default 4,
  status text not null default 'free' check (status in ('free','occupied','reserved')),
  created_at timestamptz not null default now()
);
alter table tables enable row level security;
create policy "tables_read_staff" on tables for select using (auth.uid() is not null);
create policy "tables_write_staff" on tables for all using (auth.uid() is not null);

-- ---------------------------------------------------------------
-- Comandas / pedidos
-- ---------------------------------------------------------------
create table orders (
  id uuid primary key default uuid_generate_v4(),
  table_id uuid references tables(id) on delete set null,
  table_number int,
  status text not null default 'open' check (status in ('open','paid','cancelled')),
  waiter_id uuid references profiles(id) on delete set null,
  notes text,
  total numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
alter table orders enable row level security;
create policy "orders_staff" on orders for all using (auth.uid() is not null);

-- Itens do pedido
create table order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  quantity int not null default 1,
  unit_price numeric(10,2) not null,
  notes text,
  kitchen_status text not null default 'pending' check (kitchen_status in ('pending','preparing','ready','delivered')),
  created_at timestamptz not null default now()
);
alter table order_items enable row level security;
create policy "oi_staff" on order_items for all using (auth.uid() is not null);

-- ---------------------------------------------------------------
-- Clientes (para marketing)
-- ---------------------------------------------------------------
create table customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone text unique,
  email text,
  birthday date,
  notes text,
  created_at timestamptz not null default now()
);
alter table customers enable row level security;
create policy "customers_admin" on customers for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ---------------------------------------------------------------
-- Campanhas de Marketing WhatsApp
-- ---------------------------------------------------------------
create table marketing_campaigns (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  message text not null,
  status text not null default 'draft' check (status in ('draft','sending','sent','failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  sent_count int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
alter table marketing_campaigns enable row level security;
create policy "mc_admin" on marketing_campaigns for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Destinatários da campanha
create table campaign_recipients (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid references marketing_campaigns(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  sent_at timestamptz
);
alter table campaign_recipients enable row level security;
create policy "cr_admin" on campaign_recipients for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ---------------------------------------------------------------
-- Configurações gerais
-- ---------------------------------------------------------------
create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table settings enable row level security;
create policy "settings_read_staff" on settings for select using (auth.uid() is not null);
create policy "settings_write_admin" on settings for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Seed: configurações padrão
insert into settings (key, value) values
  ('restaurant_name', '"Raízes Brasileiras"'),
  ('evolution_api_url', '""'),
  ('evolution_api_key', '""'),
  ('evolution_instance', '""');

-- ---------------------------------------------------------------
-- Função: atualizar total do pedido automaticamente
-- ---------------------------------------------------------------
create or replace function update_order_total()
returns trigger language plpgsql as $$
begin
  update orders
  set total = (
    select coalesce(sum(quantity * unit_price), 0)
    from order_items
    where order_id = coalesce(NEW.order_id, OLD.order_id)
  )
  where id = coalesce(NEW.order_id, OLD.order_id);
  return NEW;
end;
$$;

create trigger trg_order_total
after insert or update or delete on order_items
for each row execute function update_order_total();
