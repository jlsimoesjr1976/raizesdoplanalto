// Edge Function: ponte segura para a API do Mercado Pago (Point)
// O navegador não pode chamar api.mercadopago.com diretamente (CORS),
// então esta função executa as chamadas no servidor.

import { createClient } from 'npm:@supabase/supabase-js@2'

const MP_API = 'https://api.mercadopago.com'

// Somente estes caminhos podem ser acessados (evita proxy aberto)
const ALLOWED_PATHS = [
  '/users/me',
  '/point/integration-api/',
  '/v1/payments/',
]

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verifica se o chamador é um usuário autenticado do app
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { path, method = 'GET', body } = await req.json()

    if (typeof path !== 'string' || !ALLOWED_PATHS.some((p) => path.startsWith(p))) {
      return new Response(JSON.stringify({ error: 'Caminho não permitido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Lê o access token do Mercado Pago das configurações (via service role)
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: setting } = await admin
      .from('settings')
      .select('value')
      .eq('key', 'mp_access_token')
      .single()

    const accessToken = String(setting?.value ?? '').replace(/^"|"$/g, '')
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Access Token do Mercado Pago não configurado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const mpRes = await fetch(`${MP_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const mpText = await mpRes.text()
    let mpBody: unknown = null
    try { mpBody = JSON.parse(mpText) } catch { mpBody = mpText }

    // Sempre responde 200 ao cliente; se o Mercado Pago retornou erro,
    // repassa a mensagem no campo "error" para a UI exibir de forma legível.
    if (!mpRes.ok) {
      const message = (mpBody && typeof mpBody === 'object' && 'message' in mpBody)
        ? (mpBody as { message: string }).message
        : `Erro ${mpRes.status} na API do Mercado Pago`
      return new Response(JSON.stringify({ error: message, mp_status: mpRes.status }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(mpBody), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
