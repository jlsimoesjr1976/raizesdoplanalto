// Recebe eventos da Evolution API (messages.upsert) e grava as mensagens
// na tabela whatsapp_messages. Endpoint público (a Evolution posta aqui).

import { createClient } from 'npm:@supabase/supabase-js@2'

function extractText(m: Record<string, unknown> | null | undefined): string {
  if (!m) return ''
  const msg = (m as { message?: Record<string, unknown> }).message ?? {}
  if (typeof (msg as { conversation?: string }).conversation === 'string') return (msg as { conversation: string }).conversation
  const ext = (msg as { extendedTextMessage?: { text?: string } }).extendedTextMessage
  if (ext?.text) return ext.text
  const img = (msg as { imageMessage?: { caption?: string } }).imageMessage
  if (img) return img.caption ? `📷 ${img.caption}` : '📷 Imagem'
  if ((msg as { videoMessage?: unknown }).videoMessage) return '🎥 Vídeo'
  if ((msg as { audioMessage?: unknown }).audioMessage) return '🎤 Áudio'
  const docm = (msg as { documentMessage?: { fileName?: string } }).documentMessage
  if (docm) return `📎 ${docm.fileName ?? 'Documento'}`
  if ((msg as { stickerMessage?: unknown }).stickerMessage) return 'Figurinha'
  if ((msg as { locationMessage?: unknown }).locationMessage) return '📍 Localização'
  return '[mensagem]'
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 })

  try {
    const body = await req.json()
    const event = String(body.event ?? '').toLowerCase()
    // Aceita messages.upsert / messages_upsert
    if (!event.includes('messages') || !event.includes('upsert')) {
      return new Response(JSON.stringify({ ignored: event }), { status: 200 })
    }

    // data pode ser um objeto único ou lista
    const raw = body.data
    const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : (raw ? [raw] : [])

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const rows = items
      .map((it) => {
        const key = (it as { key?: { remoteJid?: string; fromMe?: boolean; id?: string } }).key ?? {}
        const jid = key.remoteJid ?? ''
        if (!jid.endsWith('@s.whatsapp.net')) return null // ignora grupos/status
        return {
          message_id: key.id ?? crypto.randomUUID(),
          jid,
          phone: jid.split('@')[0].replace(/\D/g, ''),
          from_me: !!key.fromMe,
          text: extractText(it),
          ts: Number((it as { messageTimestamp?: number }).messageTimestamp ?? Math.floor(Date.now() / 1000)),
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (rows.length > 0) {
      await admin.from('whatsapp_messages').upsert(rows, { onConflict: 'message_id' })
    }

    return new Response(JSON.stringify({ saved: rows.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 200 })
  }
})
