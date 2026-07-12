-- Mensagens de WhatsApp recebidas/enviadas (capturadas via webhook da Evolution)
create table if not exists whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  message_id text unique,
  jid text not null,
  phone text not null,
  from_me boolean not null default false,
  text text not null default '',
  ts bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_wa_messages_jid_ts on whatsapp_messages (jid, ts);

alter table whatsapp_messages enable row level security;
create policy "wa_messages_admin_read" on whatsapp_messages
  for select using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
