import { supabase } from '@/integrations/supabase/client'

// Buckets privados (financial-attachments, freelancer-attachments): o acesso
// é feito por URL assinada com validade curta, gerada na hora de abrir.

/** Abre um anexo de bucket privado numa nova aba, via URL assinada (1h). */
export async function openPrivateAttachment(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) {
    alert('Não foi possível abrir o anexo. Tente novamente.')
    return
  }
  window.open(data.signedUrl, '_blank', 'noopener')
}
