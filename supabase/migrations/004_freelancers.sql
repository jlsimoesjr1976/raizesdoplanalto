-- Cadastro de Freelancers
create table if not exists freelancers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cpf text not null,
  has_mei boolean not null default false,
  cnpj text,
  phone text,
  daily_rate numeric(10,2) not null default 0,
  registration_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table freelancers enable row level security;

create policy "freelancers_admin" on freelancers
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
