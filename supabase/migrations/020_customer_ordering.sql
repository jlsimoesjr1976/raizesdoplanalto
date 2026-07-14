-- Cardápio para clientes / pedidos online

-- Distingue pedidos online (guia "Pedidos") das comandas de mesa
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'comanda'
  CHECK (order_type IN ('comanda', 'pedido'));

-- Conta de acesso do cliente (senha gerenciada via Edge Function com PBKDF2)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_lower_uniq
  ON customers (lower(email)) WHERE password_hash IS NOT NULL;

-- Sessões do cliente (token opaco) — acessadas apenas via service role
CREATE TABLE IF NOT EXISTS customer_sessions (
  token text PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;
-- sem policies: apenas service role (Edge Functions) acessa
