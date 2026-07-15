-- As assinaturas realtime (comandas, pedidos online, fila de preparo) nunca
-- disparavam: a publicação supabase_realtime só continha whatsapp_messages.
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE tables;

-- Estoque/preço de produtos também em tempo real (a tela de Produtos exibia
-- valores em cache após lançamentos em comanda)
ALTER PUBLICATION supabase_realtime ADD TABLE products;
