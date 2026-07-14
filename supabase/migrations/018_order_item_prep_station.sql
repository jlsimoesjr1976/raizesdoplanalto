-- Fila de preparo do item (copiada do produto no momento do lançamento),
-- para alimentar a Tela da Fila de Preparo de forma robusta.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS prep_station text
  CHECK (prep_station IN ('bar', 'cozinha'));

COMMENT ON COLUMN order_items.prep_station IS 'Fila de preparo do item (copiada do produto no lançamento)';
