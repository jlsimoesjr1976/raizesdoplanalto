-- Controla se o produto aparece no cardápio online do cliente
-- (independente de 'active', que controla o uso interno em comandas)
ALTER TABLE products ADD COLUMN IF NOT EXISTS show_in_menu boolean NOT NULL DEFAULT true;
