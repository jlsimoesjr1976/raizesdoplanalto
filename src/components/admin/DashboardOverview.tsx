import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ShoppingBag, DollarSign, Table2, AlertTriangle, Clock, User, Package, Receipt, ClipboardList,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { Ingredient, Order, Product, Table } from '@/types/database'

// ── Helpers de data ─────────────────────────────────────────────────────────

function startOfToday(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function startOfYesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function pctBadge(today: number, yesterday: number): { text: string; variant: 'default' | 'secondary' } {
  if (yesterday === 0) {
    return today > 0
      ? { text: 'sem dados de ontem', variant: 'secondary' }
      : { text: 'sem movimento', variant: 'secondary' }
  }
  const pct = ((today - yesterday) / yesterday) * 100
  const sign = pct >= 0 ? '+' : ''
  return { text: `${sign}${pct.toFixed(0)}% vs ontem`, variant: 'default' }
}

function hora(ts: string): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function tempoAberta(ts: string): string {
  const min = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (min < 60) return `${min}min`
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}

const ORDER_STATUS = {
  open:      { label: 'Aberta',    className: 'bg-amber-100 text-amber-800' },
  paid:      { label: 'Paga',      className: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelada', className: 'bg-gray-100 text-gray-600' },
}

type DetailCard = 'orders' | 'revenue' | 'tables' | 'open-orders' | 'stock' | null

// ── Componente ──────────────────────────────────────────────────────────────

export function DashboardOverview() {
  const [detail, setDetail] = useState<DetailCard>(null)

  // Pedidos de hoje e ontem
  const { data: todayOrders = [] } = useQuery({
    queryKey: ['dash-orders-today'],
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, table_number, customer_name, status, total, created_at')
        .gte('created_at', startOfToday())
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Order[]
    },
  })

  const { data: yesterdayOrders = [] } = useQuery({
    queryKey: ['dash-orders-yesterday'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, total')
        .gte('created_at', startOfYesterday())
        .lt('created_at', startOfToday())
      if (error) throw error
      return data as Order[]
    },
  })

  // Mesas + comandas abertas
  const { data: tables = [] } = useQuery({
    queryKey: ['dash-tables'],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.from('tables').select('*').order('number')
      if (error) throw error
      return data as Table[]
    },
  })

  const { data: openOrders = [] } = useQuery({
    queryKey: ['dash-open-orders'],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, table_id, table_number, customer_name, total, created_at, status')
        .eq('status', 'open')
      if (error) throw error
      return data as Order[]
    },
  })

  // Estoque crítico: insumos abaixo do mínimo + produtos com estoque baixo
  const { data: ingredients = [] } = useQuery({
    queryKey: ['dash-ingredients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ingredients').select('*').order('name')
      if (error) throw error
      return data as Ingredient[]
    },
  })

  const { data: lowProducts = [] } = useQuery({
    queryKey: ['dash-low-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, stock_quantity')
        .lte('stock_quantity', 5)
        .eq('active', true)
        .order('stock_quantity')
      if (error) throw error
      return data as Product[]
    },
  })

  // ── Cálculos ──────────────────────────────────────────────────────────────

  const ordersCount = todayOrders.length
  const ordersYesterday = yesterdayOrders.length

  const paidToday = todayOrders.filter((o) => o.status === 'paid')
  const revenue = paidToday.reduce((s, o) => s + Number(o.total), 0)
  const revenueYesterday = yesterdayOrders
    .filter((o) => o.status === 'paid')
    .reduce((s, o) => s + Number(o.total), 0)

  const occupied = tables.filter((t) => t.status === 'occupied').length
  const totalTables = tables.length
  const occupancyPct = totalTables > 0 ? Math.round((occupied / totalTables) * 100) : 0

  const criticalIngredients = ingredients.filter(
    (i) => i.min_quantity > 0 && i.quantity <= i.min_quantity
  )
  const stockCritical = criticalIngredients.length + lowProducts.length

  const openToday = todayOrders.filter((o) => o.status === 'open')

  const ordersBadge = pctBadge(ordersCount, ordersYesterday)
  const revenueBadge = pctBadge(revenue, revenueYesterday)

  const stats = [
    {
      id: 'orders' as const,
      title: 'Total Pedidos Hoje',
      value: String(ordersCount),
      icon: ShoppingBag,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      badge: ordersBadge.text,
      badgeVariant: ordersBadge.variant,
    },
    {
      id: 'revenue' as const,
      title: 'Receita Hoje',
      value: formatCurrency(revenue),
      icon: DollarSign,
      color: 'text-green-600',
      bg: 'bg-green-50',
      badge: revenueBadge.text,
      badgeVariant: revenueBadge.variant,
    },
    {
      id: 'tables' as const,
      title: 'Mesas Ocupadas',
      value: `${occupied} / ${totalTables}`,
      icon: Table2,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      badge: `${occupancyPct}% ocupação`,
      badgeVariant: 'secondary' as const,
    },
    {
      id: 'open-orders' as const,
      title: 'Comandas de Hoje não Fechadas',
      value: String(openToday.length),
      icon: ClipboardList,
      color: openToday.length > 0 ? 'text-purple-600' : 'text-green-600',
      bg: openToday.length > 0 ? 'bg-purple-50' : 'bg-green-50',
      badge: openToday.length > 0 ? 'Aguardando fechamento' : 'Todas fechadas',
      badgeVariant: 'secondary' as const,
    },
    {
      id: 'stock' as const,
      title: 'Estoque Crítico',
      value: `${stockCritical} ite${stockCritical === 1 ? 'm' : 'ns'}`,
      icon: AlertTriangle,
      color: stockCritical > 0 ? 'text-red-600' : 'text-green-600',
      bg: stockCritical > 0 ? 'bg-red-50' : 'bg-green-50',
      badge: stockCritical > 0 ? 'Atenção necessária' : 'Tudo em ordem',
      badgeVariant: stockCritical > 0 ? ('destructive' as const) : ('default' as const),
    },
  ]

  const occupiedTables = tables.filter((t) => t.status === 'occupied')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Visão Geral</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Resumo de hoje, {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <Card
            key={stat.id}
            role="button"
            tabIndex={0}
            onClick={() => setDetail(stat.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setDetail(stat.id) }}
            className="border shadow-sm cursor-pointer transition-all hover:shadow-md hover:border-primary/40 active:scale-[0.99]"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={cn('p-2 rounded-lg', stat.bg)}>
                <stat.icon className={cn('w-4 h-4', stat.color)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="mt-2">
                <Badge variant={stat.badgeVariant} className="text-xs">
                  {stat.badge}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Popup: Pedidos de Hoje ── */}
      <Dialog open={detail === 'orders'} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-blue-600" />
              Pedidos de Hoje ({ordersCount})
            </DialogTitle>
          </DialogHeader>
          {todayOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum pedido registrado hoje.</p>
          ) : (
            <ScrollArea className="max-h-[55vh]">
              <div className="space-y-2 pr-2">
                {todayOrders.map((o) => {
                  const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.open
                  return (
                    <div key={o.id} className="flex items-center gap-3 p-3 rounded-lg border">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center font-bold text-sm shrink-0">
                        {o.table_number ?? '—'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          Mesa {o.table_number ?? '—'}{o.customer_name ? ` · ${o.customer_name}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {hora(o.created_at)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">{formatCurrency(Number(o.total))}</p>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', st.className)}>
                          {st.label}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Popup: Receita de Hoje ── */}
      <Dialog open={detail === 'revenue'} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              Receita de Hoje
            </DialogTitle>
          </DialogHeader>
          {paidToday.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma conta fechada hoje.</p>
          ) : (
            <>
              <ScrollArea className="max-h-[45vh]">
                <div className="space-y-2 pr-2">
                  {paidToday.map((o) => (
                    <div key={o.id} className="flex items-center gap-3 p-3 rounded-lg border">
                      <Receipt className="w-4 h-4 text-green-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          Mesa {o.table_number ?? '—'}{o.customer_name ? ` · ${o.customer_name}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">{hora(o.created_at)}</p>
                      </div>
                      <p className="text-sm font-semibold shrink-0">{formatCurrency(Number(o.total))}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex justify-between items-center pt-2 border-t font-bold">
                <span>Total ({paidToday.length} conta{paidToday.length !== 1 ? 's' : ''})</span>
                <span className="text-green-600 text-lg">{formatCurrency(revenue)}</span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Popup: Mesas Ocupadas ── */}
      <Dialog open={detail === 'tables'} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Table2 className="w-5 h-5 text-amber-600" />
              Mesas Ocupadas ({occupied} / {totalTables})
            </DialogTitle>
          </DialogHeader>
          {occupiedTables.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Todas as mesas estão livres. 🎉</p>
          ) : (
            <ScrollArea className="max-h-[55vh]">
              <div className="space-y-2 pr-2">
                {occupiedTables.map((t) => {
                  const order = openOrders.find((o) => o.table_id === t.id)
                  return (
                    <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border">
                      <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-sm shrink-0">
                        {t.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate flex items-center gap-1.5">
                          Mesa {t.number}{t.name ? ` — ${t.name}` : ''}
                        </p>
                        {order?.customer_name && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            <User className="w-3 h-3 shrink-0" />
                            {order.customer_name}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {order && (
                          <>
                            <p className="text-sm font-semibold">{formatCurrency(Number(order.total))}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                              <Clock className="w-3 h-3" />
                              {tempoAberta(order.created_at)}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Popup: Comandas de Hoje não Fechadas ── */}
      <Dialog open={detail === 'open-orders'} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-purple-600" />
              Comandas de Hoje não Fechadas ({openToday.length})
            </DialogTitle>
          </DialogHeader>
          {openToday.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Todas as comandas de hoje foram fechadas. ✅</p>
          ) : (
            <ScrollArea className="max-h-[55vh]">
              <div className="space-y-2 pr-2">
                {openToday.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 p-3 rounded-lg border">
                    <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-sm shrink-0">
                      {o.table_number ?? '—'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        Mesa {o.table_number ?? '—'}{o.customer_name ? ` · ${o.customer_name}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        aberta às {hora(o.created_at)} · {tempoAberta(o.created_at)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold shrink-0">{formatCurrency(Number(o.total))}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Popup: Estoque Crítico ── */}
      <Dialog open={detail === 'stock'} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className={cn('w-5 h-5', stockCritical > 0 ? 'text-red-600' : 'text-green-600')} />
              Estoque Crítico ({stockCritical})
            </DialogTitle>
          </DialogHeader>
          {stockCritical === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum item com estoque crítico. ✅</p>
          ) : (
            <ScrollArea className="max-h-[55vh]">
              <div className="space-y-4 pr-2">
                {criticalIngredients.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Insumos abaixo do mínimo ({criticalIngredients.length})
                    </p>
                    {criticalIngredients.map((i) => (
                      <div key={i.id} className="flex items-center gap-3 p-3 rounded-lg border bg-red-50/50">
                        <Package className="w-4 h-4 text-red-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{i.name}</p>
                          <p className="text-xs text-muted-foreground">
                            mínimo: {i.min_quantity} {i.unit}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-red-700 shrink-0">
                          {i.quantity} {i.unit}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {lowProducts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Produtos com estoque baixo ({lowProducts.length})
                    </p>
                    {lowProducts.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border bg-amber-50/50">
                        <ShoppingBag className="w-4 h-4 text-amber-600 shrink-0" />
                        <p className="flex-1 text-sm font-medium truncate">{p.name}</p>
                        <p className={cn('text-sm font-semibold shrink-0', p.stock_quantity <= 0 ? 'text-red-700' : 'text-amber-700')}>
                          {p.stock_quantity <= 0 ? 'Sem estoque' : `${p.stock_quantity} un`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
