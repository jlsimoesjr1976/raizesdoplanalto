-- Notas fiscais (NFC-e via Focus NFe)
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete set null,
  ref text unique not null,
  environment text not null default 'homologacao',
  status text not null default 'processando',   -- processando | autorizado | erro | cancelado
  cpf text,
  customer_name text,
  amount numeric(12,2) not null default 0,
  focus_status text,
  numero text,
  serie text,
  chave text,
  danfe_url text,
  xml_url text,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_invoices_order on invoices(order_id);

alter table invoices enable row level security;
create policy "invoices_admin" on invoices
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
