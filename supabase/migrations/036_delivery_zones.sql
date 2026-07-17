-- Delivery por zona/bairro: o cliente informa o CEP no cadastro, o endereço
-- é preenchido via ViaCEP (bairro confiável, sem depender de digitação), e o
-- bairro resolvido é mapeado para uma zona de entrega com taxa fixa.

CREATE TABLE IF NOT EXISTS delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  fee numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fila de bairros vistos nos cadastros: novo bairro entra com zone_id nulo
-- ("a classificar"); o admin atribui a zona certa. Assim não é preciso
-- pré-cadastrar todos os bairros de Brasília — só os que realmente aparecem.
CREATE TABLE IF NOT EXISTS delivery_neighborhoods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  neighborhood text NOT NULL UNIQUE,
  city text,
  zone_id uuid REFERENCES delivery_zones(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS cep text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS number text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS complement text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS neighborhood text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS delivery_zone_id uuid REFERENCES delivery_zones(id) ON DELETE SET NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_zone_name text;

-- RLS
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_neighborhoods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_zones_read_all ON delivery_zones;
CREATE POLICY delivery_zones_read_all ON delivery_zones FOR SELECT USING (true);
DROP POLICY IF EXISTS delivery_zones_write_admin ON delivery_zones;
CREATE POLICY delivery_zones_write_admin ON delivery_zones FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS delivery_neighborhoods_admin ON delivery_neighborhoods;
CREATE POLICY delivery_neighborhoods_admin ON delivery_neighborhoods FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Zona inicial confirmada pelo dono do restaurante
INSERT INTO delivery_zones (name, fee, sort_order)
VALUES ('Vila Planalto', 5.00, 0)
ON CONFLICT DO NOTHING;

-- O trigger que recalcula orders.total pela soma dos itens precisa somar
-- também a taxa de entrega (senão zera o delivery_fee a cada alteração de item).
CREATE OR REPLACE FUNCTION update_order_total() RETURNS trigger
LANGUAGE plpgsql AS $$
begin
  update orders
  set total = (
    select coalesce(sum(quantity * unit_price), 0)
    from order_items
    where order_id = coalesce(NEW.order_id, OLD.order_id)
  ) + coalesce((select delivery_fee from orders where id = coalesce(NEW.order_id, OLD.order_id)), 0)
  where id = coalesce(NEW.order_id, OLD.order_id);
  return NEW;
end;
$$;
