import { supabase } from '@/integrations/supabase/client'

// ── Integração Mercado Pago Point ───────────────────────────────────────────
// Docs: https://www.mercadopago.com.br/developers/pt/docs/mp-point/integration-api
// As chamadas passam pela Edge Function "mercadopago" (a API do MP bloqueia
// requisições diretas do navegador por CORS).

interface MpConfig {
  deviceId: string
}

export interface PointDevice {
  id: string
  operating_mode: 'PDV' | 'STANDALONE'
  pos_id: number
  store_id: string
  external_pos_id: string
}

export interface PaymentIntent {
  id: string
  device_id: string
  amount: number
  state:
    | 'OPEN' | 'ON_TERMINAL' | 'PROCESSING' | 'FINISHED'
    | 'CANCELED' | 'ERROR' | 'ABANDONED'
  payment?: { id: string; type?: string }
}

async function getConfig(): Promise<MpConfig> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'mp_device_id')
    .single()
  return { deviceId: String(data?.value ?? '').replace(/^"|"$/g, '') }
}

async function mpFetch<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const { data, error } = await supabase.functions.invoke('mercadopago', {
    body: { path, method, body },
  })
  if (error) {
    return { ok: false, error: `Erro na ponte com o Mercado Pago: ${error.message}` }
  }
  if (data?.error) return { ok: false, error: String(data.error) }
  return { ok: true, data: data as T }
}

/** Testa a conexão com a API (retorna o apelido da conta) */
export async function testConnection(): Promise<{ ok: boolean; nickname?: string; error?: string }> {
  const result = await mpFetch<{ nickname: string; site_id: string }>('/users/me')
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, nickname: result.data!.nickname }
}

/** Lista as maquininhas Point vinculadas à conta */
export async function listDevices(): Promise<{ ok: boolean; devices: PointDevice[]; error?: string }> {
  const result = await mpFetch<{ devices: PointDevice[] }>('/point/integration-api/devices')
  if (!result.ok) return { ok: false, devices: [], error: result.error }
  return { ok: true, devices: result.data!.devices ?? [] }
}

/** Muda o modo de operação da maquininha (PDV = controlada pelo sistema) */
export async function setDeviceOperatingMode(
  deviceId: string,
  mode: 'PDV' | 'STANDALONE'
): Promise<{ ok: boolean; error?: string }> {
  const result = await mpFetch(
    `/point/integration-api/devices/${deviceId}`,
    'PATCH',
    { operating_mode: mode }
  )
  return { ok: result.ok, error: result.error }
}

/** Envia uma intenção de pagamento para a maquininha (valor em reais) */
export async function createPaymentIntent(
  amount: number,
  description: string
): Promise<{ ok: boolean; intent?: PaymentIntent; error?: string }> {
  const config = await getConfig()
  if (!config.deviceId) return { ok: false, error: 'Nenhuma maquininha selecionada nas Configurações.' }

  // API espera o valor em centavos
  const result = await mpFetch<PaymentIntent>(
    `/point/integration-api/devices/${config.deviceId}/payment-intents`,
    'POST',
    { amount: Math.round(amount * 100), description }
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, intent: result.data }
}

/** Consulta o status de uma intenção de pagamento */
export async function getPaymentIntent(
  intentId: string
): Promise<{ ok: boolean; intent?: PaymentIntent; error?: string }> {
  const result = await mpFetch<PaymentIntent>(`/point/integration-api/payment-intents/${intentId}`)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, intent: result.data }
}

/** Cancela uma intenção de pagamento pendente na maquininha */
export async function cancelPaymentIntent(
  intentId: string
): Promise<{ ok: boolean; error?: string }> {
  const config = await getConfig()
  if (!config?.deviceId) return { ok: false, error: 'Maquininha não configurada.' }
  const result = await mpFetch(
    `/point/integration-api/devices/${config.deviceId}/payment-intents/${intentId}`,
    'DELETE'
  )
  return { ok: result.ok, error: result.error }
}
