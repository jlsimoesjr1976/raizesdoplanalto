-- Fila de preparo destino do produto ao ser lançado em uma comanda
ALTER TABLE products ADD COLUMN IF NOT EXISTS prep_station text
  CHECK (prep_station IN ('bar', 'cozinha'));

COMMENT ON COLUMN products.prep_station IS 'Fila de preparo destino: bar, cozinha ou NULL (N/A)';
