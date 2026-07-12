-- Anexos (contratos assinados) dos freelancers
alter table freelancers add column if not exists attachments jsonb not null default '[]';

insert into storage.buckets (id, name, public, file_size_limit)
values ('freelancer-attachments', 'freelancer-attachments', true, 10485760)
on conflict (id) do nothing;

create policy "freelancer_att_read" on storage.objects
  for select using (bucket_id = 'freelancer-attachments');
create policy "freelancer_att_insert" on storage.objects
  for insert with check (bucket_id = 'freelancer-attachments' and auth.role() = 'authenticated');
create policy "freelancer_att_delete" on storage.objects
  for delete using (bucket_id = 'freelancer-attachments' and auth.role() = 'authenticated');
