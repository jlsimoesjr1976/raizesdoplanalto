-- Fase B do endurecimento de segurança

-- 1) Rate limiting (janela fixa) usado pelas Edge Functions customer-auth e
--    place-order. Tabela interna: sem policies (somente service role acessa).
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket text NOT NULL,
  key text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  count int NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, key)
);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION check_rate_limit(p_bucket text, p_key text, p_max int, p_window_secs int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE allowed boolean;
BEGIN
  INSERT INTO rate_limits (bucket, key, window_start, count)
  VALUES (p_bucket, p_key, now(), 1)
  ON CONFLICT (bucket, key) DO UPDATE SET
    count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => p_window_secs)
                 THEN 1 ELSE rate_limits.count + 1 END,
    window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => p_window_secs)
                        THEN now() ELSE rate_limits.window_start END
  RETURNING rate_limits.count <= p_max INTO allowed;
  RETURN allowed;
END $$;
REVOKE EXECUTE ON FUNCTION check_rate_limit(text, text, int, int) FROM PUBLIC, anon, authenticated;

-- 2) Permissões granulares em pedidos:
--    leitura: qualquer staff; escrita: admin/caixa/atendente;
--    cozinha/bar: apenas UPDATE em order_items (status de preparo).
DROP POLICY IF EXISTS orders_staff ON orders;
CREATE POLICY orders_read_staff ON orders FOR SELECT TO authenticated USING (true);
CREATE POLICY orders_write_front ON orders FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','caixa','atendente')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','caixa','atendente')));

DROP POLICY IF EXISTS oi_staff ON order_items;
CREATE POLICY oi_read_staff ON order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY oi_write_front ON order_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','caixa','atendente')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','caixa','atendente')));
CREATE POLICY oi_update_kitchen ON order_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('cozinha','bar')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('cozinha','bar')));

-- 3) Auditoria de ajustes manuais de estoque de produto (RPC adjust_product_stock)
CREATE TABLE IF NOT EXISTS product_stock_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta numeric NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE product_stock_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY psl_read_admin ON product_stock_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE OR REPLACE FUNCTION adjust_product_stock(p_product_id uuid, p_delta numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE products SET stock_quantity = GREATEST(stock_quantity + p_delta, 0)
  WHERE id = p_product_id;
  INSERT INTO product_stock_log (product_id, delta, created_by)
  VALUES (p_product_id, p_delta, auth.uid());
END $$;
