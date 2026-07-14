// Registra um pedido online do cliente (guia "Pedidos").
// Valida a sessão do cliente, recalcula preços pelo banco, insere order + itens,
// baixa o estoque. Nunca confia em preços vindos do cliente.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

interface CartLine { product_id: string; quantity: number; notes?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { token, items, notes } = await req.json().catch(() => ({})) as { token?: string; items?: CartLine[]; notes?: string }
    if (!token) return json({ error: 'Sessão inválida. Faça login novamente.' }, 401)
    if (!Array.isArray(items) || items.length === 0) return json({ error: 'Carrinho vazio.' }, 400)

    // Loja aberta?
    const { data: statusRow } = await admin.from('settings').select('value').eq('key', 'loja_aberta').maybeSingle()
    if (statusRow && statusRow.value === false) return json({ error: 'A loja está fechada para pedidos no momento.' }, 409)

    // Valida sessão
    const { data: sess } = await admin.from('customer_sessions').select('customer_id, expires_at').eq('token', token).maybeSingle()
    if (!sess || new Date(sess.expires_at).getTime() < Date.now()) return json({ error: 'Sessão expirada. Faça login novamente.' }, 401)

    const { data: customer } = await admin.from('customers').select('id, name, phone, address, address_reference').eq('id', sess.customer_id).single()
    if (!customer) return json({ error: 'Cliente não encontrado.' }, 404)

    // Carrega os produtos do carrinho a partir do banco (fonte da verdade)
    const ids = [...new Set(items.map((i) => i.product_id))]
    const { data: products } = await admin.from('products').select('id, name, price, prep_station, stock_quantity, active').in('id', ids)
    const byId = new Map((products ?? []).map((p) => [p.id, p]))

    // Valida e monta as linhas
    const rows: { product_id: string; product_name: string; quantity: number; unit_price: number; notes: string | null; prep_station: string | null; kitchen_status: string }[] = []
    let total = 0
    for (const line of items) {
      const p = byId.get(line.product_id)
      const qty = Math.floor(Number(line.quantity))
      if (!p || !p.active) return json({ error: `Produto indisponível no carrinho.` }, 400)
      if (!qty || qty < 1) return json({ error: `Quantidade inválida para ${p.name}.` }, 400)
      if (p.stock_quantity < qty) return json({ error: `Estoque insuficiente para ${p.name}.` }, 409)
      total += Number(p.price) * qty
      rows.push({
        product_id: p.id, product_name: p.name, quantity: qty, unit_price: Number(p.price),
        notes: line.notes?.trim() || null, prep_station: p.prep_station ?? null, kitchen_status: 'pending',
      })
    }

    // Cria o pedido
    const { data: order, error: oErr } = await admin.from('orders').insert({
      order_type: 'pedido',
      status: 'open',
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      delivery_address: customer.address ?? null,
      delivery_reference: customer.address_reference ?? null,
      delivery_status: 'recebido',
      people_count: 1,
      total,
      notes: notes?.trim() || null,
    }).select('id').single()
    if (oErr || !order) return json({ error: oErr?.message ?? 'Falha ao criar pedido.' }, 500)

    // Insere itens
    const { error: iErr } = await admin.from('order_items').insert(rows.map((r) => ({ ...r, order_id: order.id })))
    if (iErr) {
      await admin.from('orders').delete().eq('id', order.id) // rollback
      return json({ error: iErr.message }, 500)
    }

    // Baixa de estoque
    await Promise.all(rows.map((r) =>
      admin.rpc('adjust_product_stock', { p_product_id: r.product_id, p_delta: -r.quantity })
    ))

    return json({ ok: true, order_id: order.id, total })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
