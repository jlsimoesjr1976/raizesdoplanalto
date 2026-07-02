-- ============================================================
-- Migration 002 — Mesas e Pedidos: campos adicionais
-- ============================================================

-- Adiciona nome/label opcional à mesa
alter table tables add column if not exists name text;

-- Garante que pedidos têm contagem de pessoas e garçom responsável
alter table orders add column if not exists people_count int not null default 1;

-- Seed: 10 mesas iniciais (não duplica se já existirem)
insert into tables (number, capacity) values
  (1, 4),(2, 4),(3, 4),(4, 4),(5, 4),
  (6, 6),(7, 6),(8, 6),(9, 2),(10, 2)
on conflict (number) do nothing;
