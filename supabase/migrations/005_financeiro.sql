-- Financeiro: Pagamentos e Recebimentos
create table if not exists financial_entries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('payment','receipt')),
  description text not null,
  amount numeric(12,2) not null,
  entry_date date not null default current_date,
  notes text,
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists idx_financial_entries_type_date on financial_entries (type, entry_date);

alter table financial_entries enable row level security;

create policy "financial_entries_admin" on financial_entries
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Bucket para anexos (pdf, xlsx, imagens etc.)
insert into storage.buckets (id, name, public, file_size_limit)
values ('financial-attachments', 'financial-attachments', true, 10485760)
on conflict (id) do nothing;

create policy "financial_attachments_read" on storage.objects
  for select using (bucket_id = 'financial-attachments');

create policy "financial_attachments_insert" on storage.objects
  for insert with check (bucket_id = 'financial-attachments' and auth.role() = 'authenticated');

create policy "financial_attachments_delete" on storage.objects
  for delete using (bucket_id = 'financial-attachments' and auth.role() = 'authenticated');
