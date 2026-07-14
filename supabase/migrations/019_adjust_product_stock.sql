-- Ajuste atômico de estoque do produto (delta negativo = baixa, positivo = devolução).
-- Nunca deixa o estoque abaixo de zero.
CREATE OR REPLACE FUNCTION adjust_product_stock(p_product_id uuid, p_delta numeric)
RETURNS void LANGUAGE sql AS $$
  UPDATE products
  SET stock_quantity = GREATEST(stock_quantity + p_delta, 0)
  WHERE id = p_product_id;
$$;

GRANT EXECUTE ON FUNCTION adjust_product_stock(uuid, numeric) TO authenticated;
