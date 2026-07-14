// Ponte segura para a API da Focus NFe (o browser é bloqueado por CORS).
// Lê o token do ambiente configurado (homologação/produção) das settings.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Exige usuário autenticado do app
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { action, ref, payload } = await req.json()

    // Lê config da Focus via service role
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const keys = ['focus_environment', 'focus_token_homologacao', 'focus_token_producao']
    const { data: rows } = await admin.from('settings').select('key, value').in('key', keys)
    const m = new Map((rows ?? []).map((r: { key: string; value: unknown }) => [r.key, String(r.value ?? '').replace(/^"|"$/g, '')]))
    const env = m.get('focus_environment') || 'homologacao'
    const token = env === 'producao' ? m.get('focus_token_producao') : m.get('focus_token_homologacao')
    if (!token) {
      return new Response(JSON.stringify({ error: `Token da Focus NFe (${env}) não configurado em Configurações.` }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const base = env === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br'
    const auth = 'Basic ' + btoa(`${token}:`)

    let url = ''
    let method = 'GET'
    let bodyStr: string | undefined
    if (action === 'emitir') {
      url = `${base}/v2/nfce?ref=${encodeURIComponent(ref)}`
      method = 'POST'
      bodyStr = JSON.stringify(payload)
    } else if (action === 'consultar') {
      url = `${base}/v2/nfce/${encodeURIComponent(ref)}`
      method = 'GET'
    } else {
      return new Response(JSON.stringify({ error: 'Ação inválida' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch(url, {
      method,
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: bodyStr,
    })
    const text = await res.text()
    let data: unknown = null
    try { data = JSON.parse(text) } catch { data = text }

    return new Response(JSON.stringify({ http_status: res.status, environment: env, base, data }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
