-- Endereço de entrega do cliente + status de entrega do pedido + loja aberta/fechada

ALTER TABLE customers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_reference text;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_reference text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'recebido'
  CHECK (delivery_status IN ('recebido','preparando','saiu_entrega','entregue'));

-- Loja aberta para pedidos (toggle no menu Pedidos)
INSERT INTO settings(key, value) VALUES ('loja_aberta', 'true'::jsonb)
  ON CONFLICT (key) DO NOTHING;

-- Permite que o cardápio público (anon) leia apenas o status da loja
DROP POLICY IF EXISTS settings_public_store_status ON settings;
CREATE POLICY settings_public_store_status ON settings
  FOR SELECT USING (key = 'loja_aberta');

-- Permite que qualquer staff autenticado alterne o status da loja (não só admin)
DROP POLICY IF EXISTS settings_toggle_store ON settings;
CREATE POLICY settings_toggle_store ON settings
  FOR UPDATE TO authenticated USING (key = 'loja_aberta') WITH CHECK (key = 'loja_aberta');
