-- Produtos podem ser marcados como "estoque infinito": ignoram a checagem de
-- quantidade em comandas, cardápio online e combos, e o trigger de baixa não
-- decrementa o estoque para eles.
ALTER TABLE products ADD COLUMN IF NOT EXISTS infinite_stock boolean NOT NULL DEFAULT false;

-- Triggers de order_items ignoram produtos de estoque infinito
CREATE OR REPLACE FUNCTION deduct_product_stock() RETURNS trigger
LANGUAGE plpgsql AS $$
begin
  if NEW.product_id is not null then
    update products set stock_quantity = stock_quantity - NEW.quantity
    where id = NEW.product_id and not infinite_stock;
  end if;
  return NEW;
end;
$$;

CREATE OR REPLACE FUNCTION restore_product_stock() RETURNS trigger
LANGUAGE plpgsql AS $$
begin
  if OLD.product_id is not null then
    update products set stock_quantity = stock_quantity + OLD.quantity
    where id = OLD.product_id and not infinite_stock;
  end if;
  return OLD;
end;
$$;

CREATE OR REPLACE FUNCTION adjust_product_stock() RETURNS trigger
LANGUAGE plpgsql AS $$
begin
  if NEW.product_id is not null and OLD.quantity != NEW.quantity then
    update products set stock_quantity = stock_quantity + (OLD.quantity - NEW.quantity)
    where id = NEW.product_id and not infinite_stock;
  end if;
  return NEW;
end;
$$;

-- RPC de ajuste manual de estoque também respeita o estoque infinito
CREATE OR REPLACE FUNCTION adjust_product_stock(p_product_id uuid, p_delta numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE products SET stock_quantity = GREATEST(stock_quantity + p_delta, 0)
  WHERE id = p_product_id AND NOT infinite_stock;
  INSERT INTO product_stock_log (product_id, delta, created_by)
  VALUES (p_product_id, p_delta, auth.uid());
END $$;

-- O cardápio público (anon) usa grant por coluna; libera a nova coluna
GRANT SELECT (infinite_stock) ON products TO anon;
