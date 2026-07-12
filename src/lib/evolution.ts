import { supabase } from '@/integrations/supabase/client'

interface EvolutionConfig {
  url: string
  apiKey: string
  instance: string
}

async function getConfig(): Promise<EvolutionConfig | null> {
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['evolution_api_url', 'evolution_api_key', 'evolution_instance'])

  if (!data) return null

  const map = Object.fromEntries(data.map((r) => [r.key, r.value as string]))
  const url = map['evolution_api_url']?.replace(/^"|"$/g, '')
  const apiKey = map['evolution_api_key']?.replace(/^"|"$/g, '')
  const instance = map['evolution_instance']?.replace(/^"|"$/g, '')

  if (!url || !apiKey || !instance) return null
  return { url, apiKey, instance }
}

/** Formata número para WhatsApp (apenas dígitos, com DDI) */
export function formatPhoneForWhatsApp(ddi: string, phone: string): string {
  const ddiClean = ddi.replace(/\D/g, '')
  const phoneClean = phone.replace(/\D/g, '')
  return `${ddiClean}${phoneClean}`
}

/** Envia mensagem de texto via Evolution API */
export async function sendWhatsAppText(ddi: string, phone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const config = await getConfig()
  if (!config) {
    return { ok: false, error: 'Evolution API não configurada. Configure em Configurações.' }
  }

  const number = formatPhoneForWhatsApp(ddi, phone)

  try {
    const res = await fetch(
      `${config.url}/message/sendText/${config.instance}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.apiKey,
        },
        body: JSON.stringify({ number, text }),
      }
    )

    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `Erro Evolution API: ${res.status} — ${body.slice(0, 120)}` }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro de conexão com a Evolution API' }
  }
}

/** Testa a conexão com a Evolution API e retorna o estado da instância */
export async function testEvolutionConnection(
  override?: EvolutionConfig
): Promise<{ ok: boolean; state?: string; error?: string }> {
  const config = override ?? await getConfig()
  if (!config || !config.url || !config.apiKey || !config.instance) {
    return { ok: false, error: 'Preencha URL, API Key e Nome da Instância.' }
  }

  const baseUrl = config.url.replace(/\/+$/, '')

  try {
    const res = await fetch(
      `${baseUrl}/instance/connectionState/${config.instance}`,
      { headers: { apikey: config.apiKey } }
    )

    if (res.status === 404) {
      return { ok: false, error: `Instância "${config.instance}" não encontrada nesta API.` }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'API Key inválida ou sem permissão.' }
    }
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `Erro ${res.status} — ${body.slice(0, 120)}` }
    }

    const j = await res.json()
    const state = j?.instance?.state ?? j?.state ?? 'desconhecido'
    return { ok: true, state }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro de conexão'
    if (/failed to fetch/i.test(msg)) {
      return { ok: false, error: 'Não foi possível alcançar a URL. Verifique o endereço e se a API permite acesso (CORS).' }
    }
    return { ok: false, error: msg }
  }
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

function baseUrl(config: EvolutionConfig) {
  return config.url.replace(/\/+$/, '')
}

/** Lista as conversas individuais (exclui grupos) */
export async function fetchChats(): Promise<{ ok: boolean; chats: WhatsAppChat[]; error?: string }> {
  const config = await getConfig()
  if (!config) return { ok: false, chats: [], error: 'Evolution API não configurada.' }
  try {
    const res = await fetch(`${baseUrl(config)}/chat/findChats/${config.instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
      body: JSON.stringify({}),
    })
    if (!res.ok) return { ok: false, chats: [], error: `Erro ${res.status} ao buscar conversas` }
    const data = await res.json()
    const list: Record<string, unknown>[] = Array.isArray(data) ? data : (data.chats ?? [])
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
  } catch (err) {
    return { ok: false, chats: [], error: err instanceof Error ? err.message : 'Erro de conexão' }
  }
}

/** Busca as mensagens de uma conversa (ordem cronológica) */
export async function fetchMessages(jid: string): Promise<{ ok: boolean; messages: WhatsAppMessage[]; error?: string }> {
  const config = await getConfig()
  if (!config) return { ok: false, messages: [], error: 'Evolution API não configurada.' }
  try {
    const res = await fetch(`${baseUrl(config)}/chat/findMessages/${config.instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
      body: JSON.stringify({ where: { key: { remoteJid: jid } } }),
    })
    if (!res.ok) return { ok: false, messages: [], error: `Erro ${res.status} ao buscar mensagens` }
    const data = await res.json()
    const records: RawMessage[] = data?.messages?.records ?? (Array.isArray(data?.messages) ? data.messages : [])
    const messages: WhatsAppMessage[] = records
      .map((r) => ({
        id: r.key?.id ?? r.id ?? String(r.messageTimestamp),
        fromMe: !!r.key?.fromMe,
        text: extractText(r),
        timestamp: Number(r.messageTimestamp ?? 0),
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
    return { ok: true, messages }
  } catch (err) {
    return { ok: false, messages: [], error: err instanceof Error ? err.message : 'Erro de conexão' }
  }
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
  const config = await getConfig()
  if (!config) return { ok: false, error: 'Evolution API não configurada.' }
  try {
    const res = await fetch(`${baseUrl(config)}/message/sendText/${config.instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
      body: JSON.stringify({ number: numberDigits, text }),
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `Erro ${res.status}: ${body.slice(0, 120)}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro de conexão' }
  }
}

/** Envia uma mídia (imagem) via URL pública, com legenda opcional */
export async function sendWhatsAppMedia(
  numberDigits: string,
  opts: { media: string; mimetype: string; fileName: string; caption?: string; mediatype?: 'image' | 'video' | 'document' }
): Promise<{ ok: boolean; error?: string }> {
  const config = await getConfig()
  if (!config) return { ok: false, error: 'Evolution API não configurada.' }
  try {
    const res = await fetch(`${baseUrl(config)}/message/sendMedia/${config.instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
      body: JSON.stringify({
        number: numberDigits,
        mediatype: opts.mediatype ?? 'image',
        mimetype: opts.mimetype,
        media: opts.media,
        fileName: opts.fileName,
        caption: opts.caption ?? '',
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `Erro ${res.status}: ${body.slice(0, 120)}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro de conexão' }
  }
}

/** Chave normalizada de telefone p/ casar com o cadastro (DDD + 8 últimos dígitos) */
export function phoneKey(raw: string): string {
  let d = (raw || '').replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
  if (d.length < 10) return d
  return d.slice(0, 2) + d.slice(-8)
}
