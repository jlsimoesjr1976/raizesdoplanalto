-- Chave Pix do freelancer (forma de pagamento no contrato)
alter table freelancers add column if not exists pix_key text;
