-- Baixa de lançamentos financeiros
alter table financial_entries add column if not exists paid boolean not null default false;
alter table financial_entries add column if not exists paid_at timestamptz;
alter table financial_entries add column if not exists payment_method text
  check (payment_method in ('pix','boleto','credito','debito','dinheiro'));
alter table financial_entries add column if not exists fine numeric(12,2) not null default 0;
alter table financial_entries add column if not exists interest numeric(12,2) not null default 0;
alter table financial_entries add column if not exists final_amount numeric(12,2);
alter table financial_entries add column if not exists receipt jsonb;
