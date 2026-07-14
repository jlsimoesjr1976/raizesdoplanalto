-- Níveis de acesso e campos do perfil
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists email text;

-- Migra papéis antigos para os novos nomes
update profiles set role = 'atendente' where role = 'waiter';
update profiles set role = 'cozinha' where role = 'kitchen';

-- Atualiza a restrição de papéis
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin','atendente','cozinha','bar','caixa'));
