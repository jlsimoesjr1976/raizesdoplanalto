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

interface CartLine { product_id?: string; combo_id?: string; quantity: number; notes?: string }

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

    // Anti-spam: no máximo 5 pedidos a cada 10 minutos por cliente
    const { data: rlOk } = await admin.rpc('check_rate_limit', {
      p_bucket: 'place_order', p_key: customer.id, p_max: 5, p_window_secs: 600,
    })
    if (rlOk === false) return json({ error: 'Muitos pedidos em sequência. Aguarde alguns minutos.' }, 429)

    // Carrega produtos e combos do carrinho a partir do banco (fonte da verdade)
    const prodIds = [...new Set(items.filter((i) => i.product_id).map((i) => i.product_id!))]
    const comboIds = [...new Set(items.filter((i) => i.combo_id).map((i) => i.combo_id!))]
    const [{ data: products }, { data: combos }] = await Promise.all([
      prodIds.length
        ? admin.from('products').select('id, name, price, prep_station, stock_quantity, infinite_stock, active').in('id', prodIds)
        : Promise.resolve({ data: [] }),
      comboIds.length
        ? admin.from('combos').select('id, name, discount_percent, active, show_in_menu, combo_items(quantity, products(id, name, price, prep_station, stock_quantity, infinite_stock, active))').in('id', comboIds)
        : Promise.resolve({ data: [] }),
    ])
    const byId = new Map((products ?? []).map((p) => [p.id, p]))
    const comboById = new Map((combos ?? []).map((c) => [c.id, c]))

    // Valida e monta as linhas. Combos são expandidos: cada produto vai à sua
    // fila de preparo, com o desconto aplicado no preço unitário, e o estoque
    // é baixado por componente.
    const rows: { product_id: string; product_name: string; quantity: number; unit_price: number; notes: string | null; prep_station: string | null; kitchen_status: string }[] = []
    // Demanda total por produto (soma de linhas avulsas + componentes de combos) p/ validar estoque
    const demand = new Map<string, { name: string; stock: number; qty: number; infinite: boolean }>()

    for (const line of items) {
      const qty = Math.floor(Number(line.quantity))
      if (!qty || qty < 1) return json({ error: 'Quantidade inválida no carrinho.' }, 400)

      if (line.combo_id) {
        const c = comboById.get(line.combo_id)
        if (!c || !c.active || !c.show_in_menu) return json({ error: 'Combo indisponível no carrinho.' }, 400)
        const comboItems = (c.combo_items ?? []) as { quantity: number; products: { id: string; name: string; price: number; prep_station: string | null; stock_quantity: number; infinite_stock: boolean; active: boolean } }[]
        if (comboItems.length === 0) return json({ error: `Combo ${c.name} sem produtos.` }, 400)
        const factor = 1 - Number(c.discount_percent) / 100
        for (const ci of comboItems) {
          const p = ci.products
          if (!p || !p.active) return json({ error: `Produto do combo ${c.name} indisponível.` }, 400)
          const compQty = ci.quantity * qty
          const d = demand.get(p.id) ?? { name: p.name, stock: Number(p.stock_quantity), qty: 0, infinite: p.infinite_stock }
          d.qty += compQty
          demand.set(p.id, d)
          rows.push({
            product_id: p.id,
            product_name: `${p.name} (Combo: ${c.name})`,
            quantity: compQty,
            unit_price: Math.round(Number(p.price) * factor * 100) / 100,
            notes: line.notes?.trim() || null,
            prep_station: p.prep_station ?? null,
            kitchen_status: 'pending',
          })
        }
      } else {
        const p = byId.get(line.product_id!)
        if (!p || !p.active) return json({ error: `Produto indisponível no carrinho.` }, 400)
        const d = demand.get(p.id) ?? { name: p.name, stock: Number(p.stock_quantity), qty: 0, infinite: p.infinite_stock }
        d.qty += qty
        demand.set(p.id, d)
        rows.push({
          product_id: p.id, product_name: p.name, quantity: qty, unit_price: Number(p.price),
          notes: line.notes?.trim() || null, prep_station: p.prep_station ?? null, kitchen_status: 'pending',
        })
      }
    }

    // Estoque suficiente para a demanda total de cada produto? (ignora quem tem estoque infinito)
    for (const d of demand.values()) {
      if (!d.infinite && d.stock < d.qty) return json({ error: `Estoque insuficiente para ${d.name}.` }, 409)
    }

    const total = rows.reduce((s, r) => s + r.unit_price * r.quantity, 0)

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

    // Estoque: baixado automaticamente pelo trigger trg_deduct_stock no INSERT
    // de order_items — não baixar manualmente aqui (duplicaria a baixa).

    return json({ ok: true, order_id: order.id, total })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
