import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Printer, CheckCircle2, ChefHat, Wine, Clock, User, UserCheck, Loader2 } from 'lucide-react'
import { imprimirPreparo } from '@/lib/printComanda'
import { notifyPedidoProntoCliente, notifyPedidoProntoAtendente } from '@/lib/comandaNotify'
import type { OrderItem } from '@/types/database'

type Station = 'bar' | 'cozinha'

interface OrderRow {
  id: string
  table_number: number | null
  customer_name: string | null
  customer_phone: string | null
  created_at: string
  profiles?: { name: string | null; phone: string | null } | null
  order_items?: OrderItem[]
}

// Um card = os itens de uma comanda destinados a UMA fila (bar ou cozinha)
interface PrepCard {
  key: string
  orderId: string
  numero: number | string
  station: Station
  cliente: string | null
  clientePhone: string | null
  atendente: string | null
  atendentePhone: string | null
  createdAt: string
  items: OrderItem[]
}

const STATION_UI: Record<Station, { label: string; icon: typeof ChefHat; badge: string; ring: string }> = {
  cozinha: { label: 'Cozinha', icon: ChefHat, badge: 'bg-amber-100 text-amber-800', ring: 'border-amber-300' },
  bar:     { label: 'Bar',     icon: Wine,    badge: 'bg-purple-100 text-purple-800', ring: 'border-purple-300' },
}

function elapsed(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  return `${h}h${String(min % 60).padStart(2, '0')}`
}

export function FilaPreparoManagement() {
  const { role } = useAuth()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const stations: Station[] = useMemo(() => {
    if (role === 'cozinha') return ['cozinha']
    if (role === 'bar') return ['bar']
    return ['cozinha', 'bar'] // admin
  }, [role])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, table_number, customer_name, customer_phone, created_at, profiles(name, phone), order_items(*)')
      .eq('status', 'open')
      .order('created_at')
    setOrders((data ?? []) as unknown as OrderRow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Realtime — novos itens lançados / mudanças de status
  useEffect(() => {
    const channel = supabase
      .channel('fila-preparo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  const cards: PrepCard[] = useMemo(() => {
    const out: PrepCard[] = []
    for (const o of orders) {
      for (const station of stations) {
        const items = (o.order_items ?? [])
          .filter((i) => i.prep_station === station && (i.kitchen_status === 'pending' || i.kitchen_status === 'preparing'))
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        if (items.length === 0) continue
        out.push({
          key: `${o.id}-${station}`,
          orderId: o.id,
          numero: o.table_number ?? '',
          station,
          cliente: o.customer_name,
          clientePhone: o.customer_phone,
          atendente: o.profiles?.name ?? null,
          atendentePhone: o.profiles?.phone ?? null,
          createdAt: items[0].created_at,
          items,
        })
      }
    }
    return out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [orders, stations])

  function handlePrint(c: PrepCard) {
    imprimirPreparo({
      numero: c.numero,
      cliente: c.cliente,
      atendente: c.atendente,
      station: c.station,
      items: c.items.map((i) => ({ quantity: i.quantity, product_name: i.product_name, notes: i.notes })),
    })
  }

  async function handlePronto(c: PrepCard) {
    setBusy(c.key)
    const ids = c.items.map((i) => i.id)
    await supabase.from('order_items').update({ kitchen_status: 'ready' }).in('id', ids)

    const resumo = c.items.map((i) => ({ name: i.product_name, quantity: i.quantity }))
    // Avisa o cliente
    if (c.clientePhone) {
      notifyPedidoProntoCliente(c.clientePhone, c.cliente, c.numero, resumo)
    }
    // Avisa o atendente responsável
    if (c.atendentePhone) {
      notifyPedidoProntoAtendente(c.atendentePhone, c.atendente, c.numero, c.cliente, c.station, resumo)
    }

    setBusy(null)
    await load()
  }

  const title = role === 'bar' ? 'Fila de Preparos — Bar'
    : role === 'cozinha' ? 'Fila de Preparos — Cozinha'
    : 'Fila de Preparos'

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="text-muted-foreground text-sm mt-0.5">
          {cards.length} pedido{cards.length !== 1 ? 's' : ''} em preparo
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      )}

      {!loading && cards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <ChefHat className="w-12 h-12 opacity-30" />
          <p className="text-sm">Nenhum pedido na fila de preparo.</p>
        </div>
      )}

      {!loading && cards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map((c) => {
            const ui = STATION_UI[c.station]
            const Icon = ui.icon
            return (
              <div key={c.key} className={`rounded-xl border-2 ${ui.ring} bg-card flex flex-col overflow-hidden`}>
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-2xl font-bold leading-none">#{c.numero}</span>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${ui.badge}`}>
                      <Icon className="w-3 h-3" /> {ui.label}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs border-t border-black/5 pt-2">
                    {c.cliente && (
                      <div className="flex items-center gap-1.5 font-medium">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="truncate">{c.cliente}</span>
                      </div>
                    )}
                    {c.atendente && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <UserCheck className="w-3.5 h-3.5" />
                        <span className="truncate">{c.atendente}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{elapsed(c.createdAt)}</span>
                    </div>
                  </div>

                  <ul className="space-y-1.5 border-t border-black/5 pt-2">
                    {c.items.map((i) => (
                      <li key={i.id} className="text-sm">
                        <div className="flex gap-2">
                          <span className="font-bold shrink-0">{i.quantity}x</span>
                          <span className="flex-1">{i.product_name}</span>
                        </div>
                        {i.notes && <p className="text-xs text-muted-foreground italic ml-6">↳ {i.notes}</p>}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="grid grid-cols-2 gap-2 p-3 border-t bg-muted/30">
                  <Button variant="outline" size="sm" onClick={() => handlePrint(c)}>
                    <Printer className="w-4 h-4 mr-1.5" /> Imprimir
                  </Button>
                  <Button size="sm" onClick={() => handlePronto(c)} disabled={busy === c.key}>
                    {busy === c.key
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Pronto</>}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
