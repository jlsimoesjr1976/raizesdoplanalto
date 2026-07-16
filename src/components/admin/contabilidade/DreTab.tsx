import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn, formatCurrency } from '@/lib/utils'
import { MONTHS_PT } from './accUtils'

type Buckets = Record<string, number>
type Mode = 'mensal' | 'trimestral' | 'anual'

async function fetchDre(from: string, to: string, regime: string): Promise<Buckets> {
  const { data, error } = await supabase.rpc('acc_dre', { p_from: from, p_to: to, p_regime: regime })
  if (error) throw error
  return Object.fromEntries(((data ?? []) as { bucket: string; amount: number }[]).map((r) => [r.bucket, Number(r.amount)]))
}

function rangeFor(mode: Mode, year: number, month: number, quarter: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  if (mode === 'anual') return { from: `${year}-01-01`, to: `${year}-12-31` }
  if (mode === 'trimestral') {
    const m0 = (quarter - 1) * 3 + 1
    const last = new Date(year, m0 + 2, 0).getDate()
    return { from: `${year}-${pad(m0)}-01`, to: `${year}-${pad(m0 + 2)}-${pad(last)}` }
  }
  const last = new Date(year, month, 0).getDate()
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` }
}

function prevPeriod(mode: Mode, year: number, month: number, quarter: number) {
  if (mode === 'anual') return { year: year - 1, month, quarter }
  if (mode === 'trimestral') return quarter === 1 ? { year: year - 1, month, quarter: 4 } : { year, month, quarter: quarter - 1 }
  return month === 1 ? { year: year - 1, month: 12, quarter } : { year, month: month - 1, quarter }
}

interface DreLine {
  label: string
  value: (b: Buckets) => number
  kind: 'group' | 'deduction' | 'result' | 'final'
}

const g = (b: Buckets, k: string) => b[k] ?? 0

const LINES: DreLine[] = [
  { label: 'Receita Bruta', kind: 'group', value: (b) => g(b, 'receita_vendas') + g(b, 'outras_receitas') },
  { label: '(−) Deduções da receita', kind: 'deduction', value: (b) => -(g(b, 'deducoes') + g(b, 'taxas_canal')) },
  { label: '= Receita Líquida', kind: 'result', value: (b) => g(b, 'receita_vendas') + g(b, 'outras_receitas') - g(b, 'deducoes') - g(b, 'taxas_canal') },
  { label: '(−) CMV e perdas', kind: 'deduction', value: (b) => -(g(b, 'cmv') + g(b, 'perdas')) },
  { label: '= Lucro Bruto', kind: 'result', value: (b) => g(b, 'receita_vendas') + g(b, 'outras_receitas') - g(b, 'deducoes') - g(b, 'taxas_canal') - g(b, 'cmv') - g(b, 'perdas') },
  { label: '(−) Despesas com pessoal', kind: 'deduction', value: (b) => -g(b, 'pessoal') },
  { label: '(−) Despesas de ocupação', kind: 'deduction', value: (b) => -g(b, 'ocupacao') },
  { label: '(−) Despesas operacionais', kind: 'deduction', value: (b) => -(g(b, 'comercial') + g(b, 'administrativas')) },
  { label: '= Resultado Operacional', kind: 'result', value: (b) => LINES[4].value(b) - g(b, 'pessoal') - g(b, 'ocupacao') - g(b, 'comercial') - g(b, 'administrativas') },
  { label: '(−) Resultado financeiro', kind: 'deduction', value: (b) => -g(b, 'financeiras') },
  { label: '(−) Impostos', kind: 'deduction', value: (b) => -g(b, 'tributarias') },
  { label: '(−) Outras despesas', kind: 'deduction', value: (b) => -g(b, 'outras_despesas') },
  { label: '= Lucro / Prejuízo Líquido', kind: 'final', value: (b) => LINES[8].value(b) - g(b, 'financeiras') - g(b, 'tributarias') - g(b, 'outras_despesas') },
]

export function DreTab() {
  const now = new Date()
  const [mode, setMode] = useState<Mode>('mensal')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [regime, setRegime] = useState<'competencia' | 'caixa'>('competencia')

  const cur = rangeFor(mode, year, month, quarter)
  const prev = prevPeriod(mode, year, month, quarter)
  const prevRange = rangeFor(mode, prev.year, prev.month, prev.quarter)

  const { data: curB = {}, isLoading: l1 } = useQuery({
    queryKey: ['acc-dre', cur.from, cur.to, regime],
    queryFn: () => fetchDre(cur.from, cur.to, regime),
  })
  const { data: prevB = {} } = useQuery({
    queryKey: ['acc-dre', prevRange.from, prevRange.to, regime],
    queryFn: () => fetchDre(prevRange.from, prevRange.to, regime),
  })

  const receitaLiquida = useMemo(() => LINES[2].value(curB), [curB])
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i)

  const periodLabel = mode === 'anual' ? String(year)
    : mode === 'trimestral' ? `${quarter}º trim/${year}`
    : `${MONTHS_PT[month - 1]}/${year}`
  const prevLabel = mode === 'anual' ? String(prev.year)
    : mode === 'trimestral' ? `${prev.quarter}º trim/${prev.year}`
    : `${MONTHS_PT[prev.month - 1]}/${prev.year}`

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mensal">Mensal</SelectItem>
            <SelectItem value="trimestral">Trimestral</SelectItem>
            <SelectItem value="anual">Anual</SelectItem>
          </SelectContent>
        </Select>
        {mode === 'mensal' && (
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS_PT.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {mode === 'trimestral' && (
          <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{[1, 2, 3, 4].map((q) => <SelectItem key={q} value={String(q)}>{q}º trimestre</SelectItem>)}</SelectContent>
          </Select>
        )}
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
      </div>

      {l1 && <div className="h-64 rounded-lg bg-muted animate-pulse" />}

      {!l1 && (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-muted/60 text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">DRE Gerencial</th>
                <th className="text-right px-3 py-2 font-medium">{periodLabel}</th>
                <th className="text-right px-3 py-2 font-medium">% RL</th>
                <th className="text-right px-3 py-2 font-medium">{prevLabel}</th>
                <th className="text-right px-3 py-2 font-medium">Δ R$</th>
                <th className="text-right px-3 py-2 font-medium">Δ %</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {LINES.map((line) => {
                const v = line.value(curB)
                const p = line.value(prevB)
                const delta = v - p
                const deltaPct = p !== 0 ? (delta / Math.abs(p)) * 100 : null
                const pctRL = receitaLiquida !== 0 ? (v / receitaLiquida) * 100 : null
                return (
                  <tr key={line.label} className={cn(
                    line.kind === 'result' && 'bg-muted/30 font-semibold',
                    line.kind === 'final' && 'bg-primary/10 font-bold',
                  )}>
                    <td className="px-3 py-2">{line.label}</td>
                    <td className={cn('text-right px-3 py-2 tabular-nums', v < 0 && 'text-red-600')}>{formatCurrency(v)}</td>
                    <td className="text-right px-3 py-2 tabular-nums text-xs text-muted-foreground">
                      {pctRL !== null ? `${pctRL.toFixed(1)}%` : '—'}
                    </td>
                    <td className={cn('text-right px-3 py-2 tabular-nums text-muted-foreground', p < 0 && 'text-red-500')}>{formatCurrency(p)}</td>
                    <td className={cn('text-right px-3 py-2 tabular-nums text-xs', delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-muted-foreground')}>
                      {delta !== 0 ? formatCurrency(delta) : '—'}
                    </td>
                    <td className={cn('text-right px-3 py-2 tabular-nums text-xs', delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-muted-foreground')}>
                      {deltaPct !== null ? `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Valores calculados dos lançamentos contabilizados ({regime === 'caixa' ? 'pela data de caixa' : 'pela competência'}).
        Lançamentos pendentes de validação não entram na DRE.
      </p>
    </div>
  )
}
