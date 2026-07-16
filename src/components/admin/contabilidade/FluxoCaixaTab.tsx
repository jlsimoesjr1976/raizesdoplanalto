import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { MONTHS_PT, monthRange } from './accUtils'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  BarChart, Bar, CartesianGrid, ReferenceLine,
} from 'recharts'
import type { FinancialEntry } from '@/types/database'

interface FlowRow { day: string; account_code: string; inflow: number; outflow: number }
interface CatRow { direction: 'entrada' | 'saida'; group_code: string; group_name: string; total: number }
interface TBRow { account_id: string; prev_debits: number; prev_credits: number; debits: number; credits: number }

const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const fmtShort = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))

/** Saldo das contas de caixa (1.1.x) imediatamente antes de `from` */
function useCashOpening(from: string) {
  return useQuery({
    queryKey: ['acc-cash-opening', from],
    queryFn: async () => {
      const [{ data: tb }, { data: accounts }] = await Promise.all([
        supabase.rpc('acc_trial_balance', { p_from: from, p_to: from, p_regime: 'caixa' }),
        supabase.from('acc_accounts').select('id, code').like('code', '1.1.%'),
      ])
      const cashIds = new Set((accounts ?? []).map((a: { id: string }) => a.id))
      return ((tb ?? []) as TBRow[])
        .filter((r) => cashIds.has(r.account_id))
        .reduce((s, r) => s + Number(r.prev_debits) - Number(r.prev_credits), 0)
    },
  })
}

export function FluxoCaixaTab() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const { from, to } = monthRange(year, month)
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i)

  return (
    <div className="space-y-4">
      <Tabs defaultValue="realizado">
        <div className="flex items-center gap-2 flex-wrap">
          <TabsList>
            <TabsTrigger value="realizado">Realizado</TabsTrigger>
            <TabsTrigger value="projecao">Projeção</TabsTrigger>
          </TabsList>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS_PT.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <TabsContent value="realizado" className="mt-4">
          <Realizado from={from} to={to} />
        </TabsContent>
        <TabsContent value="projecao" className="mt-4">
          <Projecao />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Realizado ────────────────────────────────────────────────────────────────

function Realizado({ from, to }: { from: string; to: string }) {
  const { data: opening = 0 } = useCashOpening(from)

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ['acc-cash-flow', from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('acc_cash_flow', { p_from: from, p_to: to })
      if (error) throw error
      return (data ?? []) as FlowRow[]
    },
  })

  const { data: cats = [] } = useQuery({
    queryKey: ['acc-cash-cats', from, to],
    queryFn: async () => {
      const { data } = await supabase.rpc('acc_cash_flow_categories', { p_from: from, p_to: to })
      return (data ?? []) as CatRow[]
    },
  })

  const { series, totalIn, totalOut } = useMemo(() => {
    const byDay = new Map<string, { in: number; out: number }>()
    for (const f of flows) {
      const cur = byDay.get(f.day) ?? { in: 0, out: 0 }
      cur.in += Number(f.inflow); cur.out += Number(f.outflow)
      byDay.set(f.day, cur)
    }
    const days = [...byDay.keys()].sort()
    let acc = opening
    const series = days.map((d) => {
      const v = byDay.get(d)!
      acc += v.in - v.out
      return { day: fmtDay(d), entradas: v.in, saidas: v.out, saldo: acc }
    })
    const totalIn = flows.reduce((s, f) => s + Number(f.inflow), 0)
    const totalOut = flows.reduce((s, f) => s + Number(f.outflow), 0)
    return { series, totalIn, totalOut }
  }, [flows, opening])

  const closing = opening + totalIn - totalOut

  const catData = useMemo(() => {
    const map = new Map<string, { name: string; entrada: number; saida: number }>()
    for (const c of cats) {
      const cur = map.get(c.group_code) ?? { name: c.group_name, entrada: 0, saida: 0 }
      if (c.direction === 'entrada') cur.entrada += Number(c.total)
      else cur.saida += Number(c.total)
      map.set(c.group_code, cur)
    }
    return [...map.values()].sort((a, b) => (b.entrada + b.saida) - (a.entrada + a.saida)).slice(0, 10)
  }, [cats])

  const cards = [
    { label: 'Saldo inicial', value: opening, icon: Wallet, cls: '' },
    { label: 'Entradas', value: totalIn, icon: TrendingUp, cls: 'text-green-600' },
    { label: 'Saídas', value: totalOut, icon: TrendingDown, cls: 'text-red-600' },
    { label: 'Saldo final', value: closing, icon: Wallet, cls: closing < 0 ? 'text-red-600' : 'text-green-700' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <c.icon className={cn('w-4 h-4', c.cls || 'text-muted-foreground')} />
              </div>
              <p className={cn('text-xl font-bold tabular-nums', c.cls)}>{formatCurrency(c.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading && <div className="h-64 rounded-lg bg-muted animate-pulse" />}

      {!isLoading && series.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">Sem movimentação de caixa no período.</p>
      )}

      {series.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-3">Saldo acumulado, entradas e saídas</p>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="day" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={fmtShort} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Legend />
                  <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#166534" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="entradas" name="Entradas" stroke="#16a34a" dot={false} />
                  <Line type="monotone" dataKey="saidas" name="Saídas" stroke="#dc2626" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-3">Entradas e saídas por categoria</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={catData} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis type="number" fontSize={11} tickFormatter={fmtShort} />
                  <YAxis type="category" dataKey="name" fontSize={10} width={130} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Legend />
                  <Bar dataKey="entrada" name="Entradas" fill="#16a34a" />
                  <Bar dataKey="saida" name="Saídas" fill="#dc2626" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// ── Projeção ─────────────────────────────────────────────────────────────────

function Projecao() {
  const [horizon, setHorizon] = useState(30)
  const [includeSales, setIncludeSales] = useState(true)
  const today = new Date().toISOString().split('T')[0]

  const { data: opening = 0 } = useCashOpening(today)

  // Movimento de caixa de hoje (o saldo de abertura considera até ontem)
  const { data: todayFlow = [] } = useQuery({
    queryKey: ['acc-cash-flow-today', today],
    queryFn: async () => {
      const { data } = await supabase.rpc('acc_cash_flow', { p_from: today, p_to: today })
      return (data ?? []) as FlowRow[]
    },
  })

  const { data: pendings = [] } = useQuery({
    queryKey: ['fin-open', today, horizon],
    queryFn: async () => {
      const limit = new Date(Date.now() + horizon * 86400000).toISOString().split('T')[0]
      const { data } = await supabase
        .from('financial_entries')
        .select('*')
        .eq('paid', false)
        .lte('entry_date', limit)
        .order('entry_date')
      return (data ?? []) as FinancialEntry[]
    },
  })

  // Média diária de vendas dos últimos 30 dias (pedidos/comandas pagos)
  const { data: avgSales = 0 } = useQuery({
    queryKey: ['avg-sales-30d'],
    queryFn: async () => {
      const from = new Date(Date.now() - 30 * 86400000).toISOString()
      const { data } = await supabase.from('orders').select('total').eq('status', 'paid').gte('closed_at', from)
      const total = (data ?? []).reduce((s, o) => s + Number(o.total), 0)
      return total / 30
    },
  })

  const currentBalance = opening + todayFlow.reduce((s, f) => s + Number(f.inflow) - Number(f.outflow), 0)

  const projection = useMemo(() => {
    const days: { day: string; label: string; receber: number; pagar: number; vendas: number; saldo: number }[] = []
    let acc = currentBalance
    for (let i = 1; i <= horizon; i++) {
      const d = new Date(Date.now() + i * 86400000)
      const iso = d.toISOString().split('T')[0]
      const receber = pendings.filter((p) => p.type === 'receipt' && p.entry_date <= iso && !days.some((x) => x.day >= p.entry_date && x.day < iso))
      // entradas/saídas do dia exato (vencidos entram no 1º dia)
      const dueToday = pendings.filter((p) => (i === 1 ? p.entry_date <= iso : p.entry_date === iso))
      const inflow = dueToday.filter((p) => p.type === 'receipt').reduce((s, p) => s + Number(p.amount), 0)
      const outflow = dueToday.filter((p) => p.type === 'payment').reduce((s, p) => s + Number(p.amount), 0)
      const vendas = includeSales ? avgSales : 0
      acc += inflow - outflow + vendas
      days.push({ day: iso, label: fmtDay(iso), receber: inflow, pagar: outflow, vendas, saldo: acc })
      void receber
    }
    return days
  }, [currentBalance, pendings, horizon, includeSales, avgSales])

  const negativeDay = projection.find((d) => d.saldo < 0)

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={String(horizon)} onValueChange={(v) => setHorizon(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[7, 15, 30, 60, 90].map((h) => <SelectItem key={h} value={String(h)}>{h} dias</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={includeSales} onChange={(e) => setIncludeSales(e.target.checked)} className="accent-primary" />
          Incluir média de vendas ({formatCurrency(avgSales)}/dia, últimos 30 dias)
        </label>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="border shadow-sm"><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Saldo de caixa hoje</p>
          <p className={cn('text-xl font-bold tabular-nums', currentBalance < 0 && 'text-red-600')}>{formatCurrency(currentBalance)}</p>
        </CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">A receber no horizonte</p>
          <p className="text-xl font-bold tabular-nums text-green-600">{formatCurrency(pendings.filter((p) => p.type === 'receipt').reduce((s, p) => s + Number(p.amount), 0))}</p>
        </CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">A pagar no horizonte</p>
          <p className="text-xl font-bold tabular-nums text-red-600">{formatCurrency(pendings.filter((p) => p.type === 'payment').reduce((s, p) => s + Number(p.amount), 0))}</p>
        </CardContent></Card>
      </div>

      {negativeDay && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 flex items-center gap-2 text-sm text-red-800">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>
            <span className="font-bold">Previsão de saldo negativo</span> em {negativeDay.label}:
            {' '}{formatCurrency(negativeDay.saldo)}. Antecipe recebimentos ou reprograme pagamentos.
          </span>
        </div>
      )}

      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-3">Saldo projetado — próximos {horizon} dias</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={projection}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={fmtShort} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="saldo" name="Saldo projetado" stroke="#166534" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Próximos vencimentos */}
      <div className="border rounded-lg overflow-hidden">
        <p className="text-sm font-medium px-3 py-2 bg-muted/60">Vencimentos no horizonte ({pendings.length})</p>
        <div className="divide-y max-h-64 overflow-y-auto">
          {pendings.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="text-xs text-muted-foreground w-20 shrink-0">{p.entry_date.split('-').reverse().join('/')}</span>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0', p.type === 'receipt' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                {p.type === 'receipt' ? 'Receber' : 'Pagar'}
              </span>
              <span className="flex-1 truncate">{p.description}</span>
              <span className="font-medium tabular-nums">{formatCurrency(Number(p.amount))}</span>
            </div>
          ))}
          {pendings.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nenhum vencimento em aberto no horizonte.</p>}
        </div>
      </div>
    </div>
  )
}
