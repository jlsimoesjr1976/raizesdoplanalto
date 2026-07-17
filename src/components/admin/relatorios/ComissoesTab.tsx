import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronDown, ChevronRight, HandCoins, User, ChefHat, Wine, CircleDollarSign } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { Order, Profile } from '@/types/database'

// Rateio da taxa de serviço mantida no fechamento da comanda
const SHARE = { waiter: 0.5, bar: 0.2, cozinha: 0.2, caixa: 0.1 } as const
const TEAM_KEYS = new Set(['cozinha', 'bar', 'caixa'])

function todayStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function monthStartStr(): string {
  const d = new Date()
  return todayStr(new Date(d.getFullYear(), d.getMonth(), 1))
}

interface Group {
  key: string
  label: string
  icon: React.ElementType
  colorClass: string
  total: number
  orders: { order: Order; waiterName: string; share: number }[]
}

export function ComissoesTab() {
  const [from, setFrom] = useState(monthStartStr())
  const [to, setTo] = useState(todayStr())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['comissoes-orders', from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('order_type', 'comanda')
        .eq('status', 'paid')
        .eq('service_charge_included', true)
        .gt('service_charge_amount', 0)
        .gte('closed_at', `${from}T00:00:00`)
        .lte('closed_at', `${to}T23:59:59`)
        .order('closed_at', { ascending: false })
      if (error) throw error
      return data as Order[]
    },
  })

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles-all'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*')
      return (data ?? []) as Profile[]
    },
  })
  const profileName = (id: string | null) => profiles.find((p) => p.id === id)?.name ?? 'Sem garçom atribuído'

  const groups = useMemo<Group[]>(() => {
    const waiterMap = new Map<string, Group>()
    let bar = 0, cozinha = 0, caixa = 0
    const barOrders: Group['orders'] = [], cozinhaOrders: Group['orders'] = [], caixaOrders: Group['orders'] = []

    for (const o of orders) {
      const amount = Number(o.service_charge_amount)
      const waiterKey = o.waiter_id ?? '__none__'
      const waiterName = profileName(o.waiter_id)
      const waiterShare = Math.round(amount * SHARE.waiter * 100) / 100

      const g: Group = waiterMap.get(waiterKey) ?? {
        key: waiterKey, label: waiterName, icon: User, colorClass: 'text-blue-600 bg-blue-50 border-blue-200',
        total: 0, orders: [],
      }
      g.total += waiterShare
      g.orders.push({ order: o, waiterName, share: waiterShare })
      waiterMap.set(waiterKey, g)

      const barShare = Math.round(amount * SHARE.bar * 100) / 100
      const cozinhaShare = Math.round(amount * SHARE.cozinha * 100) / 100
      const caixaShare = Math.round(amount * SHARE.caixa * 100) / 100
      bar += barShare; barOrders.push({ order: o, waiterName, share: barShare })
      cozinha += cozinhaShare; cozinhaOrders.push({ order: o, waiterName, share: cozinhaShare })
      caixa += caixaShare; caixaOrders.push({ order: o, waiterName, share: caixaShare })
    }

    const waiterGroups = [...waiterMap.values()].sort((a, b) => a.label.localeCompare(b.label))
    const teamGroups: Group[] = [
      { key: 'cozinha', label: 'Cozinha', icon: ChefHat, colorClass: 'text-amber-700 bg-amber-50 border-amber-200', total: cozinha, orders: cozinhaOrders },
      { key: 'bar', label: 'Bar', icon: Wine, colorClass: 'text-purple-700 bg-purple-50 border-purple-200', total: bar, orders: barOrders },
      { key: 'caixa', label: 'Caixa', icon: CircleDollarSign, colorClass: 'text-teal-700 bg-teal-50 border-teal-200', total: caixa, orders: caixaOrders },
    ]
    return [...waiterGroups, ...teamGroups]
  }, [orders, profiles])

  const grandTotal = orders.reduce((s, o) => s + Number(o.service_charge_amount), 0)

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function applyPreset(preset: 'hoje' | 'semana' | 'mes' | 'mes_passado') {
    const now = new Date()
    if (preset === 'hoje') { setFrom(todayStr()); setTo(todayStr()); return }
    if (preset === 'semana') {
      const d = new Date(now); d.setDate(d.getDate() - d.getDay())
      setFrom(todayStr(d)); setTo(todayStr()); return
    }
    if (preset === 'mes') { setFrom(monthStartStr()); setTo(todayStr()); return }
    if (preset === 'mes_passado') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      setFrom(todayStr(first)); setTo(todayStr(last))
    }
  }

  return (
    <div className="space-y-4">
      {/* Período */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">De</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => applyPreset('hoje')}>Hoje</Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset('semana')}>Esta semana</Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset('mes')}>Este mês</Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset('mes_passado')}>Mês passado</Button>
        </div>
      </div>

      {/* Resumo do período */}
      <Card className="border shadow-sm">
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HandCoins className="w-4 h-4" />
            {orders.length} comanda{orders.length !== 1 ? 's' : ''} com taxa de serviço mantida no período
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total de taxa de serviço arrecadada</p>
            <p className="text-lg font-bold text-primary tabular-nums">{formatCurrency(grandTotal)}</p>
          </div>
        </CardContent>
      </Card>

      {isLoading && <div className="h-48 rounded-lg bg-muted animate-pulse" />}

      {!isLoading && orders.length === 0 && (
        <div className="flex flex-col items-center py-14 text-muted-foreground gap-2">
          <HandCoins className="w-10 h-10 opacity-30" />
          <p className="text-sm">Nenhuma comanda com taxa de serviço mantida no período.</p>
        </div>
      )}

      {/* Cards colapsáveis */}
      <div className="space-y-2">
        {orders.length > 0 && groups.map((g) => (
          <div key={g.key} className={cn('rounded-lg border overflow-hidden', g.colorClass)}>
            <button
              type="button"
              onClick={() => toggle(g.key)}
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:brightness-95 transition"
            >
              {expanded.has(g.key) ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
              <g.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 font-semibold">{g.label}</span>
              <span className="text-xs opacity-70">{g.orders.length} comanda{g.orders.length !== 1 ? 's' : ''}</span>
              <span className="font-bold tabular-nums">{formatCurrency(g.total)}</span>
            </button>
            {expanded.has(g.key) && (
              <div className="bg-white border-t divide-y">
                {g.orders
                  .sort((a, b) => (b.order.closed_at ?? '').localeCompare(a.order.closed_at ?? ''))
                  .map(({ order: o, waiterName, share }) => (
                    <div key={o.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                      <span className="text-xs text-muted-foreground shrink-0 w-32">
                        {o.closed_at ? new Date(o.closed_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </span>
                      <span className="flex-1 truncate">
                        Comanda {o.table_number ?? '—'}
                        {o.customer_name && <span className="text-muted-foreground"> · {o.customer_name}</span>}
                      </span>
                      {TEAM_KEYS.has(g.key) && (
                        <span className="text-xs text-muted-foreground hidden sm:inline">Garçom: {waiterName}</span>
                      )}
                      <span className="text-xs text-muted-foreground shrink-0">taxa {formatCurrency(Number(o.service_charge_amount))}</span>
                      <span className="font-semibold tabular-nums shrink-0 w-24 text-right">{formatCurrency(share)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Rateio da taxa de serviço mantida no fechamento: 50% garçom responsável, 20% equipe do bar,
        20% equipe da cozinha, 10% equipe do caixa. Comandas fechadas antes desta funcionalidade não
        têm o valor da taxa registrado e não aparecem aqui.
      </p>
    </div>
  )
}
