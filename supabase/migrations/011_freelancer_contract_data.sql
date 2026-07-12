-- Dados do último contrato gerado (para pré-preencher o próximo)
alter table freelancers add column if not exists contract_data jsonb;
