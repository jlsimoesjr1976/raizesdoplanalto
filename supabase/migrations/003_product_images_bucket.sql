-- Cria bucket público para imagens de produtos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de acesso
CREATE POLICY "product_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

CREATE POLICY "product_images_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');

CREATE POLICY "product_images_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

CREATE POLICY "product_images_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');
