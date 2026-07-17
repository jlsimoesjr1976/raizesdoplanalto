// Autenticação de clientes (cardápio online) — separada do login de staff.
// Ações: signup, login, me, update_address, logout. Senha via PBKDF2 (Web Crypto).
// Sessão = token opaco. Endereço é estruturado (CEP + partes via ViaCEP no
// front) para que o bairro resolvido classifique a zona de entrega/taxa.

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
/** Normaliza nome de bairro p/ casar cadastros diferentes do mesmo bairro (maiúsculas, sem acento, sem espaços duplicados) */
function normalizeNeighborhood(s: string): string {
  return s.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toUpperCase()
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

async function createSession(customerId: string): Promise<string> {
  const token = newToken()
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString() // 30 dias
  await admin.from('customer_sessions').insert({ token, customer_id: customerId, expires_at: expires })
  return token
}

interface CustRow {
  id: string; name: string; email: string | null; phone: string | null
  address: string | null; address_reference: string | null
  cep: string | null; street: string | null; number: string | null; complement: string | null
  neighborhood: string | null; city: string | null; state: string | null
  delivery_zone_id: string | null
  delivery_zones?: { name: string; fee: number } | { name: string; fee: number }[] | null
}

function publicCustomer(c: CustRow) {
  const zone = Array.isArray(c.delivery_zones) ? c.delivery_zones[0] : c.delivery_zones
  return {
    id: c.id, name: c.name, email: c.email, phone: c.phone,
    address: c.address ?? null, address_reference: c.address_reference ?? null,
    cep: c.cep ?? null, street: c.street ?? null, number: c.number ?? null, complement: c.complement ?? null,
    neighborhood: c.neighborhood ?? null, city: c.city ?? null, state: c.state ?? null,
    delivery_zone: c.delivery_zone_id && zone ? { id: c.delivery_zone_id, name: zone.name, fee: Number(zone.fee) } : null,
  }
}

const CUST_COLS = 'id, name, email, phone, address, address_reference, cep, street, number, complement, neighborhood, city, state, delivery_zone_id, delivery_zones(name, fee)'

function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
}

/** true = permitido; false = limite estourado */
async function rateLimit(bucket: string, key: string, max: number, windowSecs: number): Promise<boolean> {
  const { data, error } = await admin.rpc('check_rate_limit', {
    p_bucket: bucket, p_key: key, p_max: max, p_window_secs: windowSecs,
  })
  if (error) return true // não bloqueia clientes por falha interna do limitador
  return data === true
}

/** Garante o bairro na fila de classificação e devolve o zone_id já resolvido (ou null se ainda não classificado). */
async function resolveDeliveryZone(neighborhoodRaw: string, city: string): Promise<string | null> {
  const neighborhood = normalizeNeighborhood(neighborhoodRaw)
  if (!neighborhood) return null
  const { data: existing } = await admin.from('delivery_neighborhoods').select('zone_id').eq('neighborhood', neighborhood).maybeSingle()
  if (existing) return existing.zone_id
  const { data: created } = await admin.from('delivery_neighborhoods')
    .insert({ neighborhood, city: city.trim() || null })
    .select('zone_id').single()
  return created?.zone_id ?? null
}

interface AddressInput {
  cep?: string; street?: string; number?: string; complement?: string
  neighborhood?: string; city?: string; state?: string; address_reference?: string
}

function composeAddress(a: AddressInput): string {
  const parts = [
    a.number ? `${a.street ?? ''}, ${a.number}` : (a.street ?? ''),
    a.complement?.trim(),
    a.neighborhood,
    a.city && a.state ? `${a.city}/${a.state}` : a.city,
  ].filter((p) => p && p.trim())
  return parts.join(' - ')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const payload: Record<string, string> = await req.json().catch(() => ({}))
    const action = payload.action
    const ip = clientIp(req)

    if (action === 'signup') {
      if (!(await rateLimit('signup_ip', ip, 5, 3600))) {
        return json({ error: 'Muitas tentativas de cadastro. Tente novamente mais tarde.' }, 429)
      }
      const name = (payload.name ?? '').trim()
      const email = (payload.email ?? '').trim().toLowerCase()
      const phone = onlyDigits(payload.phone)
      const password = payload.password ?? ''
      const street = (payload.street ?? '').trim()
      const number = (payload.number ?? '').trim()
      const neighborhood = (payload.neighborhood ?? '').trim()
      const city = (payload.city ?? '').trim()
      const state = (payload.state ?? 'DF').trim().toUpperCase()
      const complement = (payload.complement ?? '').trim()
      const cep = onlyDigits(payload.cep)
      const address_reference = (payload.address_reference ?? '').trim()

      if (!name) return json({ error: 'Informe seu nome.' }, 400)
      if (!email || !email.includes('@')) return json({ error: 'Informe um e-mail válido.' }, 400)
      if (password.length < 6) return json({ error: 'A senha deve ter ao menos 6 caracteres.' }, 400)
      if (!street || !number || !neighborhood || !city) {
        return json({ error: 'Informe o CEP e complete o endereço (rua, número e bairro).' }, 400)
      }

      const { data: existing } = await admin.from('customers').select('id').ilike('email', email).not('password_hash', 'is', null).maybeSingle()
      if (existing) return json({ error: 'Já existe uma conta com este e-mail.' }, 409)

      const delivery_zone_id = await resolveDeliveryZone(neighborhood, city)
      const address = composeAddress({ street, number, complement, neighborhood, city, state })
      const password_hash = await hashPassword(password)

      const { data: created, error } = await admin.from('customers')
        .insert({
          name, email, phone: phone || null, password_hash,
          address, address_reference: address_reference || null,
          cep: cep || null, street, number, complement: complement || null,
          neighborhood, city, state, delivery_zone_id,
        })
        .select(CUST_COLS).single()
      if (error) return json({ error: error.message }, 400)

      const token = await createSession(created.id)
      return json({ token, customer: publicCustomer(created as CustRow) })
    }

    if (action === 'login') {
      const email = (payload.email ?? '').trim().toLowerCase()
      const password = payload.password ?? ''
      if (!email || !password) return json({ error: 'Informe e-mail e senha.' }, 400)
      // Anti-força-bruta: por conta e por IP
      const [okEmail, okIp] = await Promise.all([
        rateLimit('login_email', email, 5, 300),
        rateLimit('login_ip', ip, 20, 300),
      ])
      if (!okEmail || !okIp) {
        return json({ error: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.' }, 429)
      }

      const { data: cust } = await admin.from('customers')
        .select(`${CUST_COLS}, password_hash`).ilike('email', email).not('password_hash', 'is', null).maybeSingle()
      if (!cust || !cust.password_hash) return json({ error: 'E-mail ou senha inválidos.' }, 401)
      const ok = await verifyPassword(password, cust.password_hash)
      if (!ok) return json({ error: 'E-mail ou senha inválidos.' }, 401)

      const token = await createSession(cust.id)
      return json({ token, customer: publicCustomer(cust as CustRow) })
    }

    if (action === 'me') {
      const token = payload.token ?? ''
      const cust = await customerFromToken(token)
      if (!cust) return json({ error: 'Sessão inválida.' }, 401)
      return json({ customer: publicCustomer(cust) })
    }

    if (action === 'update_address') {
      const token = payload.token ?? ''
      const cust = await customerFromToken(token)
      if (!cust) return json({ error: 'Sessão inválida. Faça login novamente.' }, 401)

      const street = (payload.street ?? '').trim()
      const number = (payload.number ?? '').trim()
      const neighborhood = (payload.neighborhood ?? '').trim()
      const city = (payload.city ?? '').trim()
      const state = (payload.state ?? 'DF').trim().toUpperCase()
      const complement = (payload.complement ?? '').trim()
      const cep = onlyDigits(payload.cep)
      const address_reference = (payload.address_reference ?? '').trim()
      if (!street || !number || !neighborhood || !city) {
        return json({ error: 'Informe o CEP e complete o endereço (rua, número e bairro).' }, 400)
      }

      const delivery_zone_id = await resolveDeliveryZone(neighborhood, city)
      const address = composeAddress({ street, number, complement, neighborhood, city, state })

      const { data: updated, error } = await admin.from('customers')
        .update({
          address, address_reference: address_reference || null,
          cep: cep || null, street, number, complement: complement || null,
          neighborhood, city, state, delivery_zone_id,
        })
        .eq('id', cust.id)
        .select(CUST_COLS).single()
      if (error) return json({ error: error.message }, 400)
      return json({ customer: publicCustomer(updated as CustRow) })
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

async function customerFromToken(token: string): Promise<CustRow | null> {
  if (!token) return null
  const { data: sess } = await admin.from('customer_sessions').select('customer_id, expires_at').eq('token', token).maybeSingle()
  if (!sess) return null
  if (new Date(sess.expires_at).getTime() < Date.now()) {
    await admin.from('customer_sessions').delete().eq('token', token)
    return null
  }
  const { data: cust } = await admin.from('customers').select(CUST_COLS).eq('id', sess.customer_id).single()
  return cust as CustRow | null
}
