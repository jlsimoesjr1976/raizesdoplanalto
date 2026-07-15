-- Fase C: índices nas FKs e filtros quentes (Postgres não indexa FKs sozinho)
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_type ON orders (status, order_type);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders (table_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_combo_id ON combo_items (combo_id);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer ON customer_sessions (customer_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_log_product ON product_stock_log (product_id, created_at DESC);
