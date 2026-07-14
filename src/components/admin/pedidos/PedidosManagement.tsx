import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Printer, User, Phone, Clock, MapPin, CheckCircle2, Loader2, ClipboardList, ChefHat, Bike, Store } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { imprimirComanda } from '@/lib/printComanda'
import { notifyPedidoStatus } from '@/lib/comandaNotify'
import type { Order, OrderItem } from '@/types/database'

interface PedidoOrder extends Order {
  order_items?: OrderItem[]
}

const STATUS_UI: Record<Order['delivery_status'], { label: string; badge: string; dot: string }> = {
  recebido:     { label: 'Recebido',        badge: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500' },
  preparando:   { label: 'Em preparo',      badge: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500' },
  saiu_entrega: { label: 'Saiu p/ entrega', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  entregue:     { label: 'Entregue',        badge: 'bg-green-100 text-green-700',    dot: 'bg-green-500' },
}

function shortCode(id: string) { return id.replace(/-/g, '').slice(0, 4).toUpperCase() }
function elapsed(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}

export function PedidosManagement() {
  const [pedidos, setPedidos] = useState<PedidoOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [lojaAberta, setLojaAberta] = useState(true)
  const [togglingLoja, setTogglingLoja] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('order_type', 'pedido')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
    setPedidos((data ?? []) as PedidoOrder[])
    setLoading(false)
  }, [])

  const loadLoja = useCallback(async () => {
    const { data } = await supabase.from('settings').select('value').eq('key', 'loja_aberta').maybeSingle()
    setLojaAberta(data ? data.value !== false : true)
  }, [])

  useEffect(() => { load(); loadLoja() }, [load, loadLoja])

  useEffect(() => {
    const ch = supabase
      .channel('pedidos-online')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  async function toggleLoja(v: boolean) {
    setTogglingLoja(true)
    setLojaAberta(v)
    const { error } = await supabase.from('settings').update({ value: v }).eq('key', 'loja_aberta')
    if (error) { setLojaAberta(!v); alert('Não foi possível alterar o status da loja.') }
    setTogglingLoja(false)
  }

  function handlePrint(p: PedidoOrder) {
    const items = (p.order_items ?? []).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    imprimirComanda({
      numero: shortCode(p.id),
      cliente: p.customer_name,
      data: p.created_at,
      aberta: true,
      items: items.map((i) => ({ quantity: i.quantity, product_name: i.product_name, unit_price: i.unit_price })),
      total: Number(p.total),
    })
  }

  async function setStatus(p: PedidoOrder, status: 'preparando' | 'saiu_entrega') {
    setBusy(p.id)
    await supabase.from('orders').update({ delivery_status: status }).eq('id', p.id)
    notifyPedidoStatus(p.customer_phone, p.customer_name, shortCode(p.id), status)
    setBusy(null)
    await load()
  }

  async function handleConcluir(p: PedidoOrder) {
    if (!confirm(`Concluir o pedido #${shortCode(p.id)} de ${p.customer_name ?? 'cliente'}? (marca como entregue)`)) return
    setBusy(p.id)
    await supabase.from('orders').update({ status: 'paid', delivery_status: 'entregue', closed_at: new Date().toISOString() }).eq('id', p.id)
    notifyPedidoStatus(p.customer_phone, p.customer_name, shortCode(p.id), 'entregue')
    setBusy(null)
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Pedidos</h2>
          <p className="text-muted-foreground text-sm mt-0.5">{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''} em aberto</p>
        </div>
        <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${lojaAberta ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <Store className={`w-4 h-4 ${lojaAberta ? 'text-green-600' : 'text-red-600'}`} />
          <div className="text-sm">
            <p className="font-medium leading-tight">{lojaAberta ? 'Loja aberta' : 'Loja fechada'}</p>
            <p className="text-[11px] text-muted-foreground leading-tight">para pedidos online</p>
          </div>
          <Switch checked={lojaAberta} onCheckedChange={toggleLoja} disabled={togglingLoja} />
        </div>
      </div>

      {loading && <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>}

      {!loading && pedidos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <ClipboardList className="w-12 h-12 opacity-30" />
          <p className="text-sm">Nenhum pedido no momento.</p>
        </div>
      )}

      {!loading && pedidos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pedidos.map((p) => {
            const items = (p.order_items ?? [])
            const st = STATUS_UI[p.delivery_status]
            return (
              <Card key={p.id} className="border-2 border-amber-300 bg-amber-50 flex flex-col">
                <CardContent className="p-4 flex flex-col gap-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-lg font-bold leading-none">Pedido #{shortCode(p.id)}</span>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${st.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs border-t border-black/5 pt-2">
                    {p.customer_name && <div className="flex items-center gap-1.5 font-medium text-sm"><User className="w-3.5 h-3.5 text-amber-700" /><span className="truncate">{p.customer_name}</span></div>}
                    {p.customer_phone && <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="w-3.5 h-3.5" /><span>{p.customer_phone}</span></div>}
                    {p.delivery_address && (
                      <div className="flex items-start gap-1.5 text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>{p.delivery_address}{p.delivery_reference ? ` — ${p.delivery_reference}` : ''}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-muted-foreground"><Clock className="w-3.5 h-3.5" /><span>{elapsed(p.created_at)}</span></div>
                  </div>

                  <ul className="space-y-1 border-t border-black/5 pt-2 text-sm">
                    {items.map((i) => (
                      <li key={i.id}>
                        <div className="flex gap-2">
                          <span className="font-bold shrink-0">{i.quantity}x</span>
                          <span className="flex-1">{i.product_name}</span>
                          <span className="text-muted-foreground">{formatCurrency(i.unit_price * i.quantity)}</span>
                        </div>
                        {i.notes && <p className="text-xs text-muted-foreground italic ml-6">↳ {i.notes}</p>}
                      </li>
                    ))}
                  </ul>

                  {p.notes && <p className="text-xs text-muted-foreground italic border-t border-black/5 pt-2">Obs.: {p.notes}</p>}

                  <div className="flex items-center justify-between border-t border-black/5 pt-2 mt-auto">
                    <span className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
                    <span className="text-base font-bold text-amber-700">{formatCurrency(Number(p.total))}</span>
                  </div>
                </CardContent>

                <div className="p-3 border-t bg-white/50 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={() => setStatus(p, 'preparando')} disabled={busy === p.id || p.delivery_status !== 'recebido'}>
                      <ChefHat className="w-4 h-4 mr-1.5" /> Preparo iniciado
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setStatus(p, 'saiu_entrega')} disabled={busy === p.id || p.delivery_status === 'saiu_entrega'}>
                      <Bike className="w-4 h-4 mr-1.5" /> Saiu p/ entrega
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={() => handlePrint(p)}>
                      <Printer className="w-4 h-4 mr-1.5" /> Imprimir
                    </Button>
                    <Button size="sm" onClick={() => handleConcluir(p)} disabled={busy === p.id}>
                      {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Concluir</>}
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
