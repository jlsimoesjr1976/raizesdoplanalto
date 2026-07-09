-- Histórico de lançamentos (diárias de freelancers etc.)
alter table financial_entries add column if not exists history jsonb not null default '[]';
