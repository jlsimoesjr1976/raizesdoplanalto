import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Printer, User, Phone, Clock, CheckCircle2, Loader2, ClipboardList } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { imprimirComanda } from '@/lib/printComanda'
import type { Order, OrderItem } from '@/types/database'

interface PedidoOrder extends Order {
  order_items?: OrderItem[]
}

function shortCode(id: string) {
  return id.replace(/-/g, '').slice(0, 4).toUpperCase()
}
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

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase
      .channel('pedidos-online')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

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

  async function handleConcluir(p: PedidoOrder) {
    if (!confirm(`Concluir o pedido #${shortCode(p.id)} de ${p.customer_name ?? 'cliente'}?`)) return
    setBusy(p.id)
    await supabase.from('orders').update({ status: 'paid', closed_at: new Date().toISOString() }).eq('id', p.id)
    setBusy(null)
    await load()
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Pedidos</h2>
        <p className="text-muted-foreground text-sm mt-0.5">{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''} em aberto</p>
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
            return (
              <Card key={p.id} className="border-2 border-amber-300 bg-amber-50 flex flex-col">
                <CardContent className="p-4 flex flex-col gap-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-lg font-bold leading-none">Pedido #{shortCode(p.id)}</span>
                      <span className="ml-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Online
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs border-t border-black/5 pt-2">
                    {p.customer_name && (
                      <div className="flex items-center gap-1.5 font-medium text-sm"><User className="w-3.5 h-3.5 text-amber-700" /><span className="truncate">{p.customer_name}</span></div>
                    )}
                    {p.customer_phone && (
                      <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="w-3.5 h-3.5" /><span>{p.customer_phone}</span></div>
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

                <div className={cn('grid grid-cols-2 gap-2 p-3 border-t bg-white/50')}>
                  <Button variant="outline" size="sm" onClick={() => handlePrint(p)}>
                    <Printer className="w-4 h-4 mr-1.5" /> Imprimir
                  </Button>
                  <Button size="sm" onClick={() => handleConcluir(p)} disabled={busy === p.id}>
                    {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Concluir</>}
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
