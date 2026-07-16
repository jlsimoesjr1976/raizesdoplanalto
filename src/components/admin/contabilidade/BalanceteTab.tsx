import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, SearchCheck, Scale, Loader2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { KIND_LABELS, MONTHS_PT, monthRange, signedBalance, balanceNature, sortAccounts } from './accUtils'
import type { AccAccount, AccEntry, AccKind } from '@/types/database'

interface TBRow { account_id: string; prev_debits: number; prev_credits: number; debits: number; credits: number }

interface AccRow extends AccAccount {
  prevBalance: number
  debits: number
  credits: number
  balance: number
  hasMovement: boolean
}

export function BalanceteTab() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [regime, setRegime] = useState<'competencia' | 'caixa'>('competencia')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [onlyMoved, setOnlyMoved] = useState(true)
  const [drillAccount, setDrillAccount] = useState<AccAccount | null>(null)
  const [showIssues, setShowIssues] = useState(false)

  const { from, to } = monthRange(year, month)

  const { data: accounts = [] } = useQuery({
    queryKey: ['acc-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('acc_accounts').select('*')
      if (error) throw error
      return sortAccounts(data as AccAccount[])
    },
  })

  const { data: tb = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['acc-trial-balance', from, to, regime],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('acc_trial_balance', { p_from: from, p_to: to, p_regime: regime })
      if (error) throw error
      return (data ?? []) as TBRow[]
    },
  })

  // Consolida: valores diretos + rollup para as contas-pai
  const rows = useMemo<AccRow[]>(() => {
    const byId = new Map(accounts.map((a) => [a.id, a]))
    const agg = new Map<string, { pd: number; pc: number; d: number; c: number }>()
    const bump = (id: string, r: TBRow) => {
      const cur = agg.get(id) ?? { pd: 0, pc: 0, d: 0, c: 0 }
      cur.pd += Number(r.prev_debits); cur.pc += Number(r.prev_credits)
      cur.d += Number(r.debits); cur.c += Number(r.credits)
      agg.set(id, cur)
    }
    for (const r of tb) {
      let acc = byId.get(r.account_id)
      while (acc) {
        bump(acc.id, r)
        acc = acc.parent_id ? byId.get(acc.parent_id) : undefined
      }
    }
    return accounts.map((a) => {
      const v = agg.get(a.id) ?? { pd: 0, pc: 0, d: 0, c: 0 }
      const prevBalance = signedBalance(a.nature, v.pd, v.pc)
      const balance = signedBalance(a.nature, v.pd + v.d, v.pc + v.c)
      return { ...a, prevBalance, debits: v.d, credits: v.c, balance, hasMovement: v.d !== 0 || v.c !== 0 || prevBalance !== 0 }
    })
  }, [accounts, tb])

  // Totais por tipo (nível 1)
  const totals = useMemo(() => {
    const t: Record<AccKind, number> = { ativo: 0, passivo: 0, pl: 0, receita: 0, custo: 0, despesa: 0, compensatoria: 0 }
    for (const r of rows) if (r.level === 1) t[r.kind] += r.balance
    return t
  }, [rows])

  const resultado = totals.receita - totals.custo - totals.despesa
  const equationDiff = Math.round((totals.ativo - (totals.passivo + totals.pl + resultado)) * 100) / 100

  // Percentual de participação: sobre o total do grupo de nível 1 da conta
  const rootTotal = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rows) if (r.level === 1) map.set(r.code.split('.')[0], Math.abs(r.balance))
    return map
  }, [rows])

  const visible = rows.filter((r) => {
    if (onlyMoved && !r.hasMovement) return false
    const byId = new Map(rows.map((x) => [x.id, x]))
    let p = r.parent_id ? byId.get(r.parent_id) : undefined
    while (p) {
      if (collapsed.has(p.id)) return false
      p = p.parent_id ? byId.get(p.parent_id) : undefined
    }
    return true
  })

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i)
  const summaryCards: { kind: AccKind; label: string }[] = [
    { kind: 'ativo', label: 'Total do Ativo' },
    { kind: 'passivo', label: 'Total do Passivo' },
    { kind: 'pl', label: 'Patrimônio Líquido' },
    { kind: 'receita', label: 'Receitas' },
    { kind: 'custo', label: 'Custos' },
    { kind: 'despesa', label: 'Despesas' },
  ]

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS_PT.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={regime} onValueChange={(v) => setRegime(v as typeof regime)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="competencia">Regime de competência</SelectItem>
            <SelectItem value="caixa">Regime de caixa</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => setOnlyMoved((v) => !v)}>
          {onlyMoved ? 'Mostrar todas as contas' : 'Só contas com movimento'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowIssues(true)}>
          <SearchCheck className="w-4 h-4 mr-1" />
          Ver inconsistências
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          Atualizado {new Date(dataUpdatedAt || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Validação A = P + PL + Resultado */}
      {equationDiff !== 0 ? (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 flex items-center gap-2 text-sm text-red-800">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>
            <span className="font-bold">Divergência contábil de {formatCurrency(Math.abs(equationDiff))}</span>
            {' '}— Ativo ({formatCurrency(totals.ativo)}) ≠ Passivo + PL + Resultado ({formatCurrency(totals.passivo + totals.pl + resultado)}).
            Use "Ver inconsistências" para investigar.
          </span>
        </div>
      ) : (
        <div className="rounded-lg border border-green-200 bg-green-50 p-2.5 flex items-center gap-2 text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Ativo = Passivo + Patrimônio Líquido + Resultado do período ✓
        </div>
      )}

      {/* Totais por grupo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {summaryCards.map((c) => (
          <Card key={c.kind} className="border shadow-sm">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-sm font-bold tabular-nums">{formatCurrency(totals[c.kind])}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading && <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Calculando balancete...</div>}

      {/* Tabela hierárquica */}
      {!isLoading && (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="bg-muted/60 text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">Conta</th>
                <th className="text-right px-3 py-2 font-medium">Saldo anterior</th>
                <th className="text-right px-3 py-2 font-medium">Débitos</th>
                <th className="text-right px-3 py-2 font-medium">Créditos</th>
                <th className="text-right px-3 py-2 font-medium">Saldo atual</th>
                <th className="text-center px-2 py-2 font-medium" title="Natureza do saldo">Nat.</th>
                <th className="text-right px-3 py-2 font-medium" title="Participação no grupo">%</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((r) => {
                const hasChildren = rows.some((x) => x.parent_id === r.id)
                const root = rootTotal.get(r.code.split('.')[0]) ?? 0
                const pct = root > 0 ? (Math.abs(r.balance) / root) * 100 : 0
                return (
                  <tr
                    key={r.id}
                    className={cn('hover:bg-muted/30', !r.allows_entries && 'bg-muted/20 font-medium', r.allows_entries && 'cursor-pointer')}
                    onClick={() => r.allows_entries && setDrillAccount(r)}
                    title={r.allows_entries ? 'Clique para ver os lançamentos do período' : undefined}
                  >
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5" style={{ paddingLeft: `${(r.level - 1) * 18}px` }}>
                        {hasChildren ? (
                          <button onClick={(e) => { e.stopPropagation(); toggleCollapse(r.id) }} className="text-muted-foreground hover:text-foreground shrink-0">
                            {collapsed.has(r.id) ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        ) : <span className="w-3.5 shrink-0" />}
                        <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                        <span className="truncate">{r.name}</span>
                      </div>
                    </td>
                    <td className="text-right px-3 py-1.5 tabular-nums">{formatCurrency(r.prevBalance)}</td>
                    <td className="text-right px-3 py-1.5 tabular-nums">{r.debits ? formatCurrency(r.debits) : '—'}</td>
                    <td className="text-right px-3 py-1.5 tabular-nums">{r.credits ? formatCurrency(r.credits) : '—'}</td>
                    <td className={cn('text-right px-3 py-1.5 tabular-nums font-medium', r.balance < 0 && 'text-red-600')}>{formatCurrency(r.balance)}</td>
                    <td className="text-center px-2 py-1.5"><Badge variant="outline" className="text-[10px]">{balanceNature(r.nature, r.balance)}</Badge></td>
                    <td className="text-right px-3 py-1.5 tabular-nums text-xs text-muted-foreground">{pct > 0 ? `${pct.toFixed(1)}%` : '—'}</td>
                  </tr>
                )
              })}
              {visible.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">
                  <Scale className="w-8 h-8 opacity-30 mx-auto mb-2" />
                  Sem movimentação em {MONTHS_PT[month - 1]}/{year} ({regime === 'caixa' ? 'regime de caixa' : 'regime de competência'}).
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <DrilldownModal account={drillAccount} from={from} to={to} regime={regime} onClose={() => setDrillAccount(null)} />
      <InconsistenciasModal open={showIssues} from={from} to={to} accounts={accounts} onClose={() => setShowIssues(false)} />
    </div>
  )
}

// ── Drill-down: lançamentos da conta no período ─────────────────────────────

function DrilldownModal({ account, from, to, regime, onClose }: {
  account: AccAccount | null
  from: string
  to: string
  regime: 'competencia' | 'caixa'
  onClose: () => void
}) {
  const dateCol = regime === 'caixa' ? 'cash_date' : 'competence_date'
  const { data: lines = [], isLoading } = useQuery({
    queryKey: ['acc-drill', account?.id, from, to, regime],
    enabled: !!account,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acc_entry_lines')
        .select('*, acc_entries!inner(*)')
        .eq('account_id', account!.id)
        .neq('acc_entries.status', 'rascunho')
        .gte(`acc_entries.${dateCol}`, from)
        .lte(`acc_entries.${dateCol}`, to)
      if (error) throw error
      type Row = { id: string; side: 'D' | 'C'; amount: number; acc_entries: AccEntry }
      return (data as Row[]).sort((a, b) => a.acc_entries.competence_date.localeCompare(b.acc_entries.competence_date))
    },
  })

  return (
    <Dialog open={!!account} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {account?.code} — {account?.name}
            <span className="block text-xs font-normal text-muted-foreground mt-0.5">
              Lançamentos de {from.split('-').reverse().join('/')} a {to.split('-').reverse().join('/')}
            </span>
          </DialogTitle>
        </DialogHeader>
        {isLoading && <div className="h-24 rounded bg-muted animate-pulse" />}
        {!isLoading && lines.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Nenhum lançamento no período.</p>}
        <div className="space-y-1.5">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-sm p-2 rounded border bg-muted/20">
              <span className="text-xs text-muted-foreground shrink-0 w-20">{l.acc_entries.competence_date.split('-').reverse().join('/')}</span>
              <Badge variant={l.side === 'D' ? 'default' : 'secondary'} className="text-[10px] w-5 justify-center p-0 shrink-0">{l.side}</Badge>
              <span className="flex-1 truncate">{l.acc_entries.history}</span>
              {l.acc_entries.document && <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{l.acc_entries.document}</span>}
              <Badge variant="outline" className="text-[10px] shrink-0">{l.acc_entries.origin}</Badge>
              <span className="font-medium tabular-nums shrink-0">{formatCurrency(Number(l.amount))}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Inconsistências ─────────────────────────────────────────────────────────

function InconsistenciasModal({ open, from, to, accounts, onClose }: {
  open: boolean
  from: string
  to: string
  accounts: AccAccount[]
  onClose: () => void
}) {
  const { data: issues = [], isLoading } = useQuery({
    queryKey: ['acc-issues', from, to],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from('acc_entries')
        .select('*, acc_entry_lines(*)')
        .gte('competence_date', from)
        .lte('competence_date', to)
      const entries = (data ?? []) as AccEntry[]
      const accById = new Map(accounts.map((a) => [a.id, a]))
      const found: { type: string; detail: string }[] = []

      const seen = new Map<string, AccEntry>()
      for (const e of entries) {
        const lines = e.acc_entry_lines ?? []
        const d = lines.filter((l) => l.side === 'D').reduce((s, l) => s + Number(l.amount), 0)
        const c = lines.filter((l) => l.side === 'C').reduce((s, l) => s + Number(l.amount), 0)
        if (Math.round((d - c) * 100) !== 0) {
          found.push({ type: 'Débitos ≠ Créditos', detail: `${e.competence_date} — "${e.history}": D ${formatCurrency(d)} × C ${formatCurrency(c)}` })
        }
        if (lines.length < 2) {
          found.push({ type: 'Lançamento sem contrapartida', detail: `${e.competence_date} — "${e.history}" tem ${lines.length} partida(s)` })
        }
        for (const l of lines) {
          const acc = accById.get(l.account_id)
          if (!acc) found.push({ type: 'Conta sem classificação', detail: `"${e.history}" referencia conta inexistente` })
          else if (!acc.allows_entries) found.push({ type: 'Partida em conta sintética', detail: `"${e.history}" → ${acc.code} ${acc.name}` })
        }
        if (!e.cost_center_id && (e.acc_entry_lines ?? []).every((l) => !l.cost_center_id)) {
          found.push({ type: 'Sem centro de custo', detail: `${e.competence_date} — "${e.history}"` })
        }
        if (e.status !== 'estornado') {
          const key = `${e.competence_date}|${e.history.toLowerCase().trim()}|${d.toFixed(2)}`
          const dup = seen.get(key)
          if (dup) found.push({ type: 'Possível duplicidade', detail: `${e.competence_date} — "${e.history}" (${formatCurrency(d)}) aparece mais de uma vez` })
          else seen.set(key, e)
        }
      }
      return found
    },
  })

  const grouped = issues.reduce<Record<string, string[]>>((acc, i) => {
    ;(acc[i.type] ??= []).push(i.detail)
    return acc
  }, {})

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><SearchCheck className="w-4 h-4" /> Inconsistências do período</DialogTitle>
        </DialogHeader>
        {isLoading && <div className="h-24 rounded bg-muted animate-pulse" />}
        {!isLoading && issues.length === 0 && (
          <div className="flex flex-col items-center py-8 gap-2 text-green-700">
            <CheckCircle2 className="w-10 h-10" />
            <p className="text-sm font-medium">Nenhuma inconsistência encontrada. 🎉</p>
          </div>
        )}
        {!isLoading && Object.entries(grouped).map(([type, items]) => (
          <div key={type} className="space-y-1">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              {type} <span className="text-muted-foreground font-normal">({items.length})</span>
            </p>
            <ul className="text-xs text-muted-foreground space-y-0.5 pl-5 list-disc">
              {items.slice(0, 20).map((d, i) => <li key={i}>{d}</li>)}
              {items.length > 20 && <li>... e mais {items.length - 20}</li>}
            </ul>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  )
}
