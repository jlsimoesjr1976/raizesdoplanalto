-- Fase A do endurecimento de segurança
--
-- 1) Segredos (Mercado Pago, Focus NFe, Evolution) deixam de ser legíveis por
--    staff não-admin: a leitura de settings pelo staff exclui as chaves
--    sensíveis; admin lê tudo (tela de Configurações). As Edge Functions leem
--    com service role e não são afetadas. O front passa a falar com a
--    Evolution via Edge Function "evolution-proxy".
DROP POLICY IF EXISTS settings_read_staff ON settings;
DROP POLICY IF EXISTS settings_read_staff_safe ON settings;
CREATE POLICY settings_read_staff_safe ON settings FOR SELECT TO authenticated
  USING (key NOT IN ('mp_access_token','focus_token_homologacao','focus_token_producao','evolution_api_key'));
DROP POLICY IF EXISTS settings_read_admin ON settings;
CREATE POLICY settings_read_admin ON settings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 2) Anexos financeiros e de freelancers deixam de ser públicos: buckets
--    privados, leitura somente por staff autenticado; o front abre via URL
--    assinada (src/lib/attachments.ts).
UPDATE storage.buckets SET public = false
  WHERE id IN ('financial-attachments','freelancer-attachments');
DROP POLICY IF EXISTS financial_attachments_read ON storage.objects;
CREATE POLICY financial_attachments_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'financial-attachments');
DROP POLICY IF EXISTS freelancer_att_read ON storage.objects;
CREATE POLICY freelancer_att_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'freelancer-attachments');

-- 3) O papel anônimo (cardápio público) perde acesso às colunas sensíveis de
--    products (preço de custo, NCM/CEST/CFOP/CSOSN, origem, fila de preparo):
--    grant por coluna. Staff autenticado segue com acesso total.
REVOKE SELECT ON products FROM anon;
GRANT SELECT (id, category_id, name, description, price, image_url,
              stock_quantity, active, show_in_menu, sort_order, created_at)
  ON products TO anon;
