-- Combos: conjunto de produtos vendidos com desconto percentual.
-- Ao entrar num pedido (comanda ou cardápio online), o combo é expandido em
-- itens individuais (cada produto vai à sua fila de preparo e baixa seu
-- próprio estoque), com o desconto aplicado no preço unitário de cada item.

CREATE TABLE IF NOT EXISTS combos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  discount_percent numeric NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  image_url text,
  active boolean NOT NULL DEFAULT true,
  show_in_menu boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS combo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id uuid NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1)
);

ALTER TABLE combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY combos_read_all ON combos FOR SELECT USING (true);
CREATE POLICY combos_write_admin ON combos FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY combo_items_read_all ON combo_items FOR SELECT USING (true);
CREATE POLICY combo_items_write_admin ON combo_items FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
