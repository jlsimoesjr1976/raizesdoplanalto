import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { MONTHS_PT, sortAccounts } from './accUtils'
import type { AccAccount } from '@/types/database'

interface TBRow { account_id: string; prev_debits: number; prev_credits: number; debits: number; credits: number }
type Mode = 'mensal' | 'trimestral' | 'semestral' | 'anual'

function endDate(mode: Mode, year: number, month: number, part: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  let m: number
  if (mode === 'anual') m = 12
  else if (mode === 'semestral') m = part * 6
  else if (mode === 'trimestral') m = part * 3
  else m = month
  const last = new Date(year, m, 0).getDate()
  return `${year}-${pad(m)}-${pad(last)}`
}

function prevEnd(mode: Mode, year: number, month: number, part: number): string {
  if (mode === 'anual') return endDate(mode, year - 1, month, part)
  if (mode === 'semestral') return part === 1 ? endDate(mode, year - 1, month, 2) : endDate(mode, year, month, 1)
  if (mode === 'trimestral') return part === 1 ? endDate(mode, year - 1, month, 4) : endDate(mode, year, month, part - 1)
  return month === 1 ? endDate(mode, year - 1, 12, part) : endDate(mode, year, month - 1, part)
}

/** Saldos acumulados até a data, por conta (com sinal pela natureza) */
function useBalances(asOf: string, regime: string) {
  return useQuery({
    queryKey: ['acc-balances', asOf, regime],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('acc_trial_balance', { p_from: asOf, p_to: asOf, p_regime: regime })
      if (error) throw error
      const map = new Map<string, { d: number; c: number }>()
      for (const r of (data ?? []) as TBRow[]) {
        map.set(r.account_id, {
          d: Number(r.prev_debits) + Number(r.debits),
          c: Number(r.prev_credits) + Number(r.credits),
        })
      }
      return map
    },
  })
}

interface Section { title: string; prefixes: string[]; side: 'ativo' | 'passivo' }

const SECTIONS: Section[] = [
  { title: 'ATIVO CIRCULANTE', prefixes: ['1.1', '1.2', '1.3', '1.4'], side: 'ativo' },
  { title: 'ATIVO NÃO CIRCULANTE', prefixes: ['1.5'], side: 'ativo' },
  { title: 'PASSIVO CIRCULANTE', prefixes: ['2.1', '2.2', '2.3', '2.5'], side: 'passivo' },
  { title: 'PASSIVO NÃO CIRCULANTE', prefixes: ['2.4'], side: 'passivo' },
  { title: 'PATRIMÔNIO LÍQUIDO', prefixes: ['3.1', '3.2', '3.3'], side: 'passivo' },
]

export function BalancoTab() {
  const now = new Date()
  const [mode, setMode] = useState<Mode>('mensal')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [part, setPart] = useState(1)
  const [year, setYear] = useState(now.getFullYear())
  const [regime, setRegime] = useState<'competencia' | 'caixa'>('competencia')

  const asOf = endDate(mode, year, month, part)
  const prevAsOf = prevEnd(mode, year, month, part)

  const { data: accounts = [] } = useQuery({
    queryKey: ['acc-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('acc_accounts').select('*')
      if (error) throw error
      return sortAccounts(data as AccAccount[])
    },
  })
  const { data: cur = new Map(), isLoading } = useBalances(asOf, regime)
  const { data: prev = new Map() } = useBalances(prevAsOf, regime)

  const calc = useMemo(() => {
    const balOf = (map: Map<string, { d: number; c: number }>, a: AccAccount) => {
      const v = map.get(a.id)
      if (!v) return 0
      return a.nature === 'D' ? v.d - v.c : v.c - v.d
    }
    // Resultado acumulado (receitas − custos − despesas) entra no PL
    const resultado = (map: Map<string, { d: number; c: number }>) =>
      accounts.filter((a) => a.level === 1).reduce((s, a) => {
        const b = balOf(map, a)
        if (a.kind === 'receita') return s + b
        if (a.kind === 'custo' || a.kind === 'despesa') return s - b
        return s
      }, 0)

    // Linhas por grupo de nível 2 (rollup dos filhos)
    const groupRows = (prefixes: string[]) =>
      accounts
        .filter((a) => a.level === 2 && prefixes.includes(a.code))
        .map((g2) => {
          const children = accounts.filter((a) => a.code === g2.code || a.code.startsWith(g2.code + '.'))
          const v = children.filter((a) => a.allows_entries).reduce((s, a) => s + balOf(cur, a), 0)
          const p = children.filter((a) => a.allows_entries).reduce((s, a) => s + balOf(prev, a), 0)
          return { code: g2.code, name: g2.name, v, p }
        })

    const sections = SECTIONS.map((s) => {
      const rows = groupRows(s.prefixes)
      return { ...s, rows, total: rows.reduce((x, r) => x + r.v, 0), prevTotal: rows.reduce((x, r) => x + r.p, 0) }
    })

    const resAtual = resultado(cur)
    const resAnterior = resultado(prev)
    // Resultado do exercício compõe o PL
    const plIdx = sections.findIndex((s) => s.title === 'PATRIMÔNIO LÍQUIDO')
    sections[plIdx].rows.push({ code: '3.9', name: 'Resultado do exercício', v: resAtual, p: resAnterior })
    sections[plIdx].total += resAtual
    sections[plIdx].prevTotal += resAnterior

    const totalAtivo = sections.filter((s) => s.side === 'ativo').reduce((s, x) => s + x.total, 0)
    const totalPassivo = sections.filter((s) => s.side === 'passivo').reduce((s, x) => s + x.total, 0)
    return { sections, totalAtivo, totalPassivo, diff: Math.round((totalAtivo - totalPassivo) * 100) / 100 }
  }, [accounts, cur, prev])

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i)
  const fmtPct = (v: number, base: number) => (base !== 0 ? `${((v / base) * 100).toFixed(1)}%` : '—')

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Select value={mode} onValueChange={(v) => { setMode(v as Mode); setPart(1) }}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mensal">Mensal</SelectItem>
            <SelectItem value="trimestral">Trimestral</SelectItem>
            <SelectItem value="semestral">Semestral</SelectItem>
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
          <Select value={String(part)} onValueChange={(v) => setPart(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{[1, 2, 3, 4].map((q) => <SelectItem key={q} value={String(q)}>{q}º trimestre</SelectItem>)}</SelectContent>
          </Select>
        )}
        {mode === 'semestral' && (
          <Select value={String(part)} onValueChange={(v) => setPart(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{[1, 2].map((q) => <SelectItem key={q} value={String(q)}>{q}º semestre</SelectItem>)}</SelectContent>
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

      {calc.diff !== 0 ? (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 flex items-center gap-2 text-sm text-red-800">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>
            <span className="font-bold">Divergência de {formatCurrency(Math.abs(calc.diff))}</span> — Total do Ativo ≠ Passivo + PL.
            O fechamento da competência fica bloqueado até a correção.
          </span>
        </div>
      ) : (
        <div className="rounded-lg border border-green-200 bg-green-50 p-2.5 flex items-center gap-2 text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Ativo ({formatCurrency(calc.totalAtivo)}) = Passivo + Patrimônio Líquido ✓
        </div>
      )}

      {isLoading && <div className="h-64 rounded-lg bg-muted animate-pulse" />}

      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(['ativo', 'passivo'] as const).map((side) => (
            <div key={side} className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="bg-muted/60 text-xs text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">{side === 'ativo' ? 'ATIVO' : 'PASSIVO + PL'}</th>
                    <th className="text-right px-3 py-2 font-medium">{asOf.split('-').reverse().join('/')}</th>
                    <th className="text-right px-3 py-2 font-medium">Anterior</th>
                    <th className="text-right px-3 py-2 font-medium">Δ %</th>
                    <th className="text-right px-3 py-2 font-medium" title="Análise vertical (% do total do ativo)">AV</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {calc.sections.filter((s) => s.side === side).map((s) => (
                    <>
                      <tr key={s.title} className="bg-muted/30 font-semibold">
                        <td className="px-3 py-1.5">{s.title}</td>
                        <td className="text-right px-3 py-1.5 tabular-nums">{formatCurrency(s.total)}</td>
                        <td className="text-right px-3 py-1.5 tabular-nums text-muted-foreground">{formatCurrency(s.prevTotal)}</td>
                        <td className="text-right px-3 py-1.5 tabular-nums text-xs">
                          {s.prevTotal !== 0 ? `${(((s.total - s.prevTotal) / Math.abs(s.prevTotal)) * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className="text-right px-3 py-1.5 tabular-nums text-xs text-muted-foreground">{fmtPct(s.total, calc.totalAtivo)}</td>
                      </tr>
                      {s.rows.filter((r) => r.v !== 0 || r.p !== 0).map((r) => (
                        <tr key={r.code} className="hover:bg-muted/20">
                          <td className="px-3 py-1 pl-7 text-muted-foreground">{r.name}</td>
                          <td className={cn('text-right px-3 py-1 tabular-nums', r.v < 0 && 'text-red-600')}>{formatCurrency(r.v)}</td>
                          <td className="text-right px-3 py-1 tabular-nums text-muted-foreground">{formatCurrency(r.p)}</td>
                          <td className="text-right px-3 py-1 tabular-nums text-xs text-muted-foreground">
                            {r.p !== 0 ? `${(((r.v - r.p) / Math.abs(r.p)) * 100).toFixed(1)}%` : '—'}
                          </td>
                          <td className="text-right px-3 py-1 tabular-nums text-xs text-muted-foreground">{fmtPct(r.v, calc.totalAtivo)}</td>
                        </tr>
                      ))}
                    </>
                  ))}
                  <tr className="bg-primary/10 font-bold">
                    <td className="px-3 py-2">TOTAL {side === 'ativo' ? 'DO ATIVO' : 'PASSIVO + PL'}</td>
                    <td className="text-right px-3 py-2 tabular-nums">
                      {formatCurrency(side === 'ativo' ? calc.totalAtivo : calc.totalPassivo)}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
