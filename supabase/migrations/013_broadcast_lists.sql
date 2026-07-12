-- Listas de distribuição do Marketing (WhatsApp)
create table if not exists broadcast_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  member_ids jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table broadcast_lists enable row level security;
create policy "broadcast_lists_admin" on broadcast_lists
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
