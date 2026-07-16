import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, ChevronRight, Target, Loader2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { KIND_LABELS, MONTHS_PT, monthRange, sortAccounts } from './accUtils'
import { ExportMenu } from './ExportMenu'
import type { ReportData } from './reportExport'
import type { AccAccount, AccKind } from '@/types/database'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts'

interface Budget { id: string; account_id: string; year: number; month: number; amount: number }
interface TBRow { account_id: string; prev_debits: number; prev_credits: number; debits: number; credits: number }

const fmtShort = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))

export function OrcamentoTab() {
  const now = new Date()
  const queryClient = useQueryClient()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [onlyBudgeted, setOnlyBudgeted] = useState(false)

  const { from, to } = monthRange(year, month)
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  const { data: accounts = [] } = useQuery({
    queryKey: ['acc-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('acc_accounts').select('*').eq('allows_entries', true)
      if (error) throw error
      return sortAccounts(data as AccAccount[])
    },
  })
  const allAccounts = useQuery({
    queryKey: ['acc-accounts-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('acc_accounts').select('*')
      if (error) throw error
      return sortAccounts(data as AccAccount[])
    },
  }).data ?? []

  const { data: budgets = [], isLoading: bLoading } = useQuery({
    queryKey: ['acc-budgets', year, month],
    queryFn: async () => {
      const { data, error } = await supabase.from('acc_budgets').select('*').eq('year', year).eq('month', month)
      if (error) throw error
      return data as Budget[]
    },
  })

  const { data: tb = [], isLoading: tbLoading } = useQuery({
    queryKey: ['acc-trial-balance', from, to, 'competencia'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('acc_trial_balance', { p_from: from, p_to: to, p_regime: 'competencia' })
      if (error) throw error
      return (data ?? []) as TBRow[]
    },
  })

  const budgetByAccount = useMemo(() => new Map(budgets.map((b) => [b.account_id, b])), [budgets])
  const realizedByAccount = useMemo(() => {
    const map = new Map<string, number>()
    const byId = new Map(allAccounts.map((a) => [a.id, a]))
    for (const r of tb) {
      const acc = byId.get(r.account_id)
      if (!acc) continue
      const bal = acc.nature === 'D' ? Number(r.debits) - Number(r.credits) : Number(r.credits) - Number(r.debits)
      map.set(r.account_id, bal)
    }
    return map
  }, [tb, allAccounts])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['acc-budgets'] })

  async function saveBudget(accountId: string, amount: number) {
    const existing = budgetByAccount.get(accountId)
    if (amount === 0 && existing) {
      await supabase.from('acc_budgets').delete().eq('id', existing.id)
    } else if (amount !== 0) {
      await supabase.from('acc_budgets').upsert(
        { account_id: accountId, year, month, amount },
        { onConflict: 'account_id,year,month' }
      )
    }
    invalidate()
  }

  const rows = useMemo(() => accounts.map((a) => {
    const budgeted = Number(budgetByAccount.get(a.id)?.amount ?? 0)
    const realized = realizedByAccount.get(a.id) ?? 0
    const diff = realized - budgeted
    const diffPct = budgeted !== 0 ? (diff / Math.abs(budgeted)) * 100 : null
    return { ...a, budgeted, realized, diff, diffPct }
  }).filter((r) => !onlyBudgeted || r.budgeted !== 0 || r.realized !== 0), [accounts, budgetByAccount, realizedByAccount, onlyBudgeted])

  // Rollup por tipo (kind) para o gráfico realizado x orçado
  const chartData = useMemo(() => {
    const byKind: Record<string, { budgeted: number; realized: number }> = {}
    for (const r of rows) {
      const cur = byKind[r.kind] ?? { budgeted: 0, realized: 0 }
      cur.budgeted += r.budgeted
      cur.realized += r.realized
      byKind[r.kind] = cur
    }
    return Object.entries(byKind)
      .filter(([, v]) => v.budgeted !== 0 || v.realized !== 0)
      .map(([kind, v]) => ({ name: KIND_LABELS[kind as AccKind], Orçado: v.budgeted, Realizado: v.realized }))
  }, [rows])

  const visibleGrouped = useMemo(() => {
    const parentOf = new Map(allAccounts.map((a) => [a.id, a.parent_id]))
    return rows.filter((r) => {
      let pid = parentOf.get(r.id)
      while (pid) {
        if (collapsed.has(pid)) return false
        pid = parentOf.get(pid) ?? undefined
      }
      return true
    })
  }, [rows, collapsed, allAccounts])

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const loading = bLoading || tbLoading

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS_PT.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => setOnlyBudgeted((v) => !v)}>
          {onlyBudgeted ? 'Mostrar todas as contas' : 'Só orçadas / com movimento'}
        </Button>
        <ExportMenu getData={() => orcamentoReportData(visibleGrouped, month, year)} />
      </div>

      {chartData.length > 0 && (
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-3">Realizado × Orçado por tipo de conta</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={fmtShort} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Legend />
                <Bar dataKey="Orçado" fill="#94a3b8" />
                <Bar dataKey="Realizado" fill="#166534" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {loading && <div className="h-64 rounded-lg bg-muted animate-pulse" />}

      {!loading && (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="bg-muted/60 text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">Conta</th>
                <th className="text-right px-3 py-2 font-medium">Orçado (meta)</th>
                <th className="text-right px-3 py-2 font-medium">Realizado</th>
                <th className="text-right px-3 py-2 font-medium">Diferença</th>
                <th className="text-right px-3 py-2 font-medium">Δ %</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleGrouped.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-3 py-1.5">
                    <span className="font-mono text-xs text-muted-foreground mr-1.5">{r.code}</span>
                    {r.name}
                  </td>
                  <td className="text-right px-3 py-1 w-32">
                    <Input
                      defaultValue={r.budgeted ? String(r.budgeted) : ''}
                      placeholder="0,00"
                      inputMode="decimal"
                      className="h-7 text-right text-sm"
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        const n = v === '' ? 0 : parseFloat(v.replace(',', '.'))
                        if (!isNaN(n) && n !== r.budgeted) saveBudget(r.id, n)
                      }}
                    />
                  </td>
                  <td className="text-right px-3 py-1.5 tabular-nums">{formatCurrency(r.realized)}</td>
                  <td className={cn('text-right px-3 py-1.5 tabular-nums font-medium', r.diff < 0 ? 'text-red-600' : r.diff > 0 && r.budgeted !== 0 ? 'text-green-600' : '')}>
                    {r.budgeted !== 0 || r.realized !== 0 ? formatCurrency(r.diff) : '—'}
                  </td>
                  <td className="text-right px-3 py-1.5 tabular-nums text-xs text-muted-foreground">
                    {r.diffPct !== null ? `${r.diffPct > 0 ? '+' : ''}${r.diffPct.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
              {visibleGrouped.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">
                  <Target className="w-8 h-8 opacity-30 mx-auto mb-2" />
                  Nenhuma meta definida para {MONTHS_PT[month - 1]}/{year}.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Digite a meta mensal por conta e pressione Tab ou clique fora para salvar. O realizado é
        calculado pelo regime de competência. Diferença = Realizado − Orçado (positivo em despesas
        indica estouro do orçamento).
      </p>
    </div>
  )
}

// ── Exportação ───────────────────────────────────────────────────────────────

interface BudgetRow extends AccAccount { budgeted: number; realized: number; diff: number; diffPct: number | null }

function orcamentoReportData(rows: BudgetRow[], month: number, year: number): ReportData {
  return {
    title: 'Orçamento × Realizado',
    subtitle: `${MONTHS_PT[month - 1]}/${year}`,
    columns: [
      { key: 'code', header: 'Código' },
      { key: 'name', header: 'Conta' },
      { key: 'budgeted', header: 'Orçado', align: 'right' },
      { key: 'realized', header: 'Realizado', align: 'right' },
      { key: 'diff', header: 'Diferença', align: 'right' },
    ],
    rows: rows.map((r) => ({
      code: r.code,
      name: r.name,
      budgeted: formatCurrency(r.budgeted),
      realized: formatCurrency(r.realized),
      diff: formatCurrency(r.diff),
    })),
  }
}
