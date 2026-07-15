// Ponte segura para a Evolution API (WhatsApp).
// A API key NUNCA chega ao navegador: fica em settings, lida aqui com service
// role. Somente staff autenticado pode chamar; apenas endpoints da allowlist.
// O teste de conexão com credenciais alternativas (override) é restrito a admin.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Prefixos permitidos (o nome da instância é acrescentado pelo servidor)
const ALLOWED = ['message/sendText', 'message/sendMedia', 'chat/findChats', 'chat/findMessages', 'instance/connectionState']

interface OverrideConfig { url: string; apiKey: string; instance: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    // Autentica o chamador (staff)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return json({ error: 'Não autenticado.' }, 401)

    const { endpoint, body, override } = await req.json().catch(() => ({})) as {
      endpoint?: string; body?: unknown; override?: OverrideConfig
    }
    if (!endpoint || !ALLOWED.some((p) => endpoint === p)) return json({ error: 'Endpoint não permitido.' }, 403)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    let config: OverrideConfig
    if (override) {
      // Testar credenciais alternativas: somente admin
      const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single()
      if (me?.role !== 'admin') return json({ error: 'Apenas administradores podem testar credenciais.' }, 403)
      config = override
    } else {
      const { data } = await admin.from('settings').select('key, value')
        .in('key', ['evolution_api_url', 'evolution_api_key', 'evolution_instance'])
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, String(r.value ?? '').replace(/^"|"$/g, '')]))
      config = { url: m['evolution_api_url'], apiKey: m['evolution_api_key'], instance: m['evolution_instance'] }
    }
    if (!config.url || !config.apiKey || !config.instance) {
      return json({ error: 'Evolution API não configurada. Configure em Configurações.' }, 400)
    }

    const base = config.url.replace(/\/+$/, '')
    const url = `${base}/${endpoint}/${encodeURIComponent(config.instance)}`
    const isGet = endpoint === 'instance/connectionState'
    const res = await fetch(url, {
      method: isGet ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
      body: isGet ? undefined : JSON.stringify(body ?? {}),
    })

    const text = await res.text()
    let data: unknown
    try { data = JSON.parse(text) } catch { data = text }
    return json({ status: res.status, ok: res.ok, data })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
