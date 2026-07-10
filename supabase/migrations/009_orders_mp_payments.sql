-- IDs de transações Mercado Pago Point vinculadas ao fechamento da conta
alter table orders add column if not exists mp_payment_ids jsonb not null default '[]';
