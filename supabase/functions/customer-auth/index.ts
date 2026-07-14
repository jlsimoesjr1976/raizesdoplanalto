// Autenticação de clientes (cardápio online) — separada do login de staff.
// Ações: signup, login, me. Senha via PBKDF2 (Web Crypto). Sessão = token opaco.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const enc = new TextEncoder()
const ITER = 120_000

function b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}
async function pbkdf2(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256)
  return b64(bits)
}
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt)
  return `pbkdf2$${ITER}$${b64(salt.buffer)}$${hash}`
}
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [, , saltB64, hash] = stored.split('$')
    const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0))
    const calc = await pbkdf2(password, salt)
    return calc === hash
  } catch {
    return false
  }
}
function newToken(): string {
  return b64(crypto.getRandomValues(new Uint8Array(32)).buffer).replace(/[+/=]/g, (m) => ({ '+': '-', '/': '_', '=': '' }[m]!))
}
function onlyDigits(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

async function createSession(customerId: string): Promise<string> {
  const token = newToken()
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString() // 30 dias
  await admin.from('customer_sessions').insert({ token, customer_id: customerId, expires_at: expires })
  return token
}

function publicCustomer(c: { id: string; name: string; email: string | null; phone: string | null; address?: string | null; address_reference?: string | null }) {
  return { id: c.id, name: c.name, email: c.email, phone: c.phone, address: c.address ?? null, address_reference: c.address_reference ?? null }
}

const CUST_COLS = 'id, name, email, phone, address, address_reference'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const payload: Record<string, string> = await req.json().catch(() => ({}))
    const action = payload.action

    if (action === 'signup') {
      const name = (payload.name ?? '').trim()
      const email = (payload.email ?? '').trim().toLowerCase()
      const phone = onlyDigits(payload.phone)
      const address = (payload.address ?? '').trim()
      const address_reference = (payload.address_reference ?? '').trim()
      const password = payload.password ?? ''
      if (!name) return json({ error: 'Informe seu nome.' }, 400)
      if (!email || !email.includes('@')) return json({ error: 'Informe um e-mail válido.' }, 400)
      if (!address) return json({ error: 'Informe o endereço de entrega.' }, 400)
      if (password.length < 6) return json({ error: 'A senha deve ter ao menos 6 caracteres.' }, 400)

      const { data: existing } = await admin.from('customers').select('id').ilike('email', email).not('password_hash', 'is', null).maybeSingle()
      if (existing) return json({ error: 'Já existe uma conta com este e-mail.' }, 409)

      const password_hash = await hashPassword(password)
      const { data: created, error } = await admin.from('customers')
        .insert({ name, email, phone: phone || null, address, address_reference: address_reference || null, password_hash })
        .select(CUST_COLS).single()
      if (error) return json({ error: error.message }, 400)

      const token = await createSession(created.id)
      return json({ token, customer: publicCustomer(created) })
    }

    if (action === 'login') {
      const email = (payload.email ?? '').trim().toLowerCase()
      const password = payload.password ?? ''
      if (!email || !password) return json({ error: 'Informe e-mail e senha.' }, 400)

      const { data: cust } = await admin.from('customers')
        .select(`${CUST_COLS}, password_hash`).ilike('email', email).not('password_hash', 'is', null).maybeSingle()
      if (!cust || !cust.password_hash) return json({ error: 'E-mail ou senha inválidos.' }, 401)
      const ok = await verifyPassword(password, cust.password_hash)
      if (!ok) return json({ error: 'E-mail ou senha inválidos.' }, 401)

      const token = await createSession(cust.id)
      return json({ token, customer: publicCustomer(cust) })
    }

    if (action === 'me') {
      const token = payload.token ?? ''
      const cust = await customerFromToken(token)
      if (!cust) return json({ error: 'Sessão inválida.' }, 401)
      return json({ customer: publicCustomer(cust) })
    }

    if (action === 'logout') {
      const token = payload.token ?? ''
      if (token) await admin.from('customer_sessions').delete().eq('token', token)
      return json({ ok: true })
    }

    return json({ error: 'Ação inválida.' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

async function customerFromToken(token: string) {
  if (!token) return null
  const { data: sess } = await admin.from('customer_sessions').select('customer_id, expires_at').eq('token', token).maybeSingle()
  if (!sess) return null
  if (new Date(sess.expires_at).getTime() < Date.now()) {
    await admin.from('customer_sessions').delete().eq('token', token)
    return null
  }
  const { data: cust } = await admin.from('customers').select(CUST_COLS).eq('id', sess.customer_id).single()
  return cust
}
