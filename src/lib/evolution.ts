import { supabase } from '@/integrations/supabase/client'

// Todas as chamadas HTTP à Evolution API passam pela Edge Function
// "evolution-proxy": a API key fica no servidor e nunca chega ao navegador.

interface EvolutionConfig {
  url: string
  apiKey: string
  instance: string
}

interface ProxyResult<T = unknown> { status: number; ok: boolean; data: T; error?: string }

async function evoFetch<T = unknown>(
  endpoint: string,
  body?: unknown,
  override?: EvolutionConfig
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const { data, error } = await supabase.functions.invoke('evolution-proxy', {
    body: { endpoint, body, override },
  })
  if (error) return { ok: false, status: 0, error: error.message }
  const r = data as ProxyResult<T>
  if (r.error) return { ok: false, status: r.status ?? 0, error: r.error }
  return { ok: r.ok, status: r.status, data: r.data }
}

/** Formata número para WhatsApp (apenas dígitos, com DDI) */
export function formatPhoneForWhatsApp(ddi: string, phone: string): string {
  const ddiClean = ddi.replace(/\D/g, '')
  const phoneClean = phone.replace(/\D/g, '')
  return `${ddiClean}${phoneClean}`
}

/** Envia mensagem de texto via Evolution API */
export async function sendWhatsAppText(ddi: string, phone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const number = formatPhoneForWhatsApp(ddi, phone)
  const r = await evoFetch('message/sendText', { number, text })
  if (!r.ok) return { ok: false, error: r.error ?? `Erro Evolution API: ${r.status}` }
  return { ok: true }
}

/** Testa a conexão com a Evolution API e retorna o estado da instância */
export async function testEvolutionConnection(
  override?: EvolutionConfig
): Promise<{ ok: boolean; state?: string; error?: string }> {
  if (override && (!override.url || !override.apiKey || !override.instance)) {
    return { ok: false, error: 'Preencha URL, API Key e Nome da Instância.' }
  }
  const r = await evoFetch<{ instance?: { state?: string }; state?: string }>('instance/connectionState', undefined, override)
  if (r.status === 404) return { ok: false, error: 'Instância não encontrada nesta API.' }
  if (r.status === 401 || r.status === 403) return { ok: false, error: r.error ?? 'API Key inválida ou sem permissão.' }
  if (!r.ok) return { ok: false, error: r.error ?? `Erro ${r.status}` }
  const j = r.data
  const state = j?.instance?.state ?? j?.state ?? 'desconhecido'
  return { ok: true, state }
}

/** Gera código numérico de 4 dígitos */
export function generateVerificationCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

// ── Conversas / mensagens (Marketing) ───────────────────────────────────────

export interface WhatsAppChat {
  jid: string
  phone: string       // apenas dígitos
  pushName: string
  lastText: string
  lastFromMe: boolean
  timestamp: number
  unread: number
}

export interface WhatsAppMessage {
  id: string
  fromMe: boolean
  text: string
  timestamp: number
}

interface RawMessage {
  key?: { fromMe?: boolean; id?: string }
  messageType?: string
  message?: Record<string, unknown>
  messageTimestamp?: number
  id?: string
}

/** Extrai o texto legível de uma mensagem do WhatsApp */
function extractText(m: RawMessage | null | undefined): string {
  if (!m) return ''
  const msg = (m.message ?? {}) as Record<string, { text?: string; caption?: string; fileName?: string } | string>
  if (typeof msg.conversation === 'string') return msg.conversation
  const ext = msg.extendedTextMessage as { text?: string } | undefined
  if (ext?.text) return ext.text
  const img = msg.imageMessage as { caption?: string } | undefined
  if (img) return img.caption ? `📷 ${img.caption}` : '📷 Imagem'
  if (msg.videoMessage) return '🎥 Vídeo'
  if (msg.audioMessage) return '🎤 Áudio'
  const docm = msg.documentMessage as { fileName?: string } | undefined
  if (docm) return `📎 ${docm.fileName ?? 'Documento'}`
  if (msg.stickerMessage) return 'Figurinha'
  if (msg.locationMessage) return '📍 Localização'
  return '[mensagem]'
}

/** Lista as conversas individuais (exclui grupos) */
export async function fetchChats(): Promise<{ ok: boolean; chats: WhatsAppChat[]; error?: string }> {
  const r = await evoFetch<Record<string, unknown>[] | { chats?: Record<string, unknown>[] }>('chat/findChats', {})
  if (!r.ok) return { ok: false, chats: [], error: r.error ?? `Erro ${r.status} ao buscar conversas` }
  const data = r.data
  const list: Record<string, unknown>[] = Array.isArray(data) ? data : (data?.chats ?? [])
  const chats: WhatsAppChat[] = list
    .filter((c) => typeof c.remoteJid === 'string' && (c.remoteJid as string).endsWith('@s.whatsapp.net'))
    .map((c) => {
      const jid = c.remoteJid as string
      const lm = c.lastMessage as RawMessage | undefined
      return {
        jid,
        phone: jid.split('@')[0].replace(/\D/g, ''),
        pushName: (c.pushName as string) || '',
        lastText: extractText(lm),
        lastFromMe: !!lm?.key?.fromMe,
        timestamp: Number(lm?.messageTimestamp ?? c.updatedAt ?? 0),
        unread: Number(c.unreadCount ?? 0),
      }
    })
    .sort((a, b) => b.timestamp - a.timestamp)
  return { ok: true, chats }
}

/** Busca as mensagens de uma conversa (ordem cronológica) */
export async function fetchMessages(jid: string): Promise<{ ok: boolean; messages: WhatsAppMessage[]; error?: string }> {
  const r = await evoFetch<{ messages?: { records?: RawMessage[] } | RawMessage[] }>('chat/findMessages', { where: { key: { remoteJid: jid } } })
  if (!r.ok) return { ok: false, messages: [], error: r.error ?? `Erro ${r.status} ao buscar mensagens` }
  const data = r.data
  const records: RawMessage[] = (data?.messages as { records?: RawMessage[] })?.records
    ?? (Array.isArray(data?.messages) ? (data?.messages as RawMessage[]) : [])
  const messages: WhatsAppMessage[] = records
    .map((m) => ({
      id: m.key?.id ?? m.id ?? String(m.messageTimestamp),
      fromMe: !!m.key?.fromMe,
      text: extractText(m),
      timestamp: Number(m.messageTimestamp ?? 0),
    }))
    .sort((a, b) => a.timestamp - b.timestamp)
  return { ok: true, messages }
}

/** Mensagens capturadas via webhook (tabela whatsapp_messages) */
export async function fetchStoredMessages(jid: string): Promise<WhatsAppMessage[]> {
  const { data } = await supabase
    .from('whatsapp_messages')
    .select('message_id, from_me, text, ts')
    .eq('jid', jid)
    .order('ts', { ascending: true })
  return (data ?? []).map((r) => ({
    id: r.message_id as string,
    fromMe: !!r.from_me,
    text: (r.text as string) ?? '',
    timestamp: Number(r.ts),
  }))
}

/** Última mensagem capturada (webhook) por conversa — para a prévia da lista */
export async function fetchLatestStoredByJid(): Promise<Map<string, { text: string; fromMe: boolean; timestamp: number }>> {
  const { data } = await supabase
    .from('whatsapp_messages')
    .select('jid, from_me, text, ts')
    .order('ts', { ascending: false })
    .limit(1000)
  const map = new Map<string, { text: string; fromMe: boolean; timestamp: number }>()
  for (const r of data ?? []) {
    if (!map.has(r.jid as string)) {
      map.set(r.jid as string, { text: (r.text as string) ?? '', fromMe: !!r.from_me, timestamp: Number(r.ts) })
    }
  }
  return map
}

/** Mescla histórico da Evolution (enviadas) com o webhook (recebidas/novas) */
export async function fetchConversationMessages(jid: string): Promise<{ ok: boolean; messages: WhatsAppMessage[] }> {
  const [evo, stored] = await Promise.all([fetchMessages(jid), fetchStoredMessages(jid)])
  const map = new Map<string, WhatsAppMessage>()
  if (evo.ok) for (const m of evo.messages) map.set(m.id, m)
  for (const m of stored) map.set(m.id, m)
  const messages = [...map.values()].sort((a, b) => a.timestamp - b.timestamp)
  return { ok: evo.ok || stored.length > 0, messages }
}

/** Envia texto para um número já normalizado (somente dígitos, com DDI) */
export async function sendWhatsAppRaw(numberDigits: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const r = await evoFetch('message/sendText', { number: numberDigits, text })
  if (!r.ok) return { ok: false, error: r.error ?? `Erro ${r.status}` }
  return { ok: true }
}

/** Envia uma mídia (imagem) via URL pública, com legenda opcional */
export async function sendWhatsAppMedia(
  numberDigits: string,
  opts: { media: string; mimetype: string; fileName: string; caption?: string; mediatype?: 'image' | 'video' | 'document' }
): Promise<{ ok: boolean; error?: string }> {
  const r = await evoFetch('message/sendMedia', {
    number: numberDigits,
    mediatype: opts.mediatype ?? 'image',
    mimetype: opts.mimetype,
    media: opts.media,
    fileName: opts.fileName,
    caption: opts.caption ?? '',
  })
  if (!r.ok) return { ok: false, error: r.error ?? `Erro ${r.status}` }
  return { ok: true }
}

/** Chave normalizada de telefone p/ casar com o cadastro (DDD + 8 últimos dígitos) */
export function phoneKey(raw: string): string {
  let d = (raw || '').replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
  if (d.length < 10) return d
  return d.slice(0, 2) + d.slice(-8)
}
