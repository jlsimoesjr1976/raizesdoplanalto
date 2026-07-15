-- Controla se a categoria (e seus produtos) aparece no cardápio online do cliente
ALTER TABLE categories ADD COLUMN IF NOT EXISTS show_in_menu boolean NOT NULL DEFAULT true;
