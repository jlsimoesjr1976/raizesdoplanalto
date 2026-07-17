-- Relatórios > Comissões: precisa saber, por comanda fechada, se a taxa de
-- serviço foi mantida e qual foi o valor exato cobrado (o percentual em
-- settings pode mudar depois, então gravamos o valor no momento do fechamento).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge_included boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge_percent numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge_amount numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_service_charge
  ON orders (closed_at)
  WHERE service_charge_included = true AND status = 'paid';
