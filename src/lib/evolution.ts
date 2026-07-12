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
