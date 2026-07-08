-- Cadastro de Fornecedores
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

alter table suppliers enable row level security;
create policy "suppliers_admin" on suppliers
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Cadastro de Funcionários
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cpf text,
  phone text,
  position text,
  salary numeric(10,2),
  created_at timestamptz not null default now()
);

alter table employees enable row level security;
create policy "employees_admin" on employees
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Beneficiário em lançamentos financeiros
alter table financial_entries add column if not exists beneficiary_type text
  check (beneficiary_type in ('freelancer','supplier','employee'));
alter table financial_entries add column if not exists beneficiary_id uuid;
alter table financial_entries add column if not exists beneficiary_name text;
