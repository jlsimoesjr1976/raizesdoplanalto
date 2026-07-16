import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Settings2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { MONTHS_PT, monthRange } from './accUtils'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  BarChart, Bar, CartesianGrid,
} from 'recharts'

type Buckets = Record<string, number>
interface TBRow { account_id: string; prev_debits: number; prev_credits: number; debits: number; credits: number }
interface SeriesRow { month: string; bucket: string; amount: number }
interface Faixas { cmv: { bom: number; atencao: number }; folha: { bom: number; atencao: number }; ocupacao: { bom: number; atencao: number }; margem_liquida: { bom: number; atencao: number } }

const DEFAULT_FAIXAS: Faixas = {
  cmv: { bom: 30, atencao: 35 },
  folha: { bom: 25, atencao: 35 },
  ocupacao: { bom: 10, atencao: 15 },
  margem_liquida: { bom: 10, atencao: 5 },
}

const g = (b: Buckets, k: string) => b[k] ?? 0
const fmtShort = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))

/** bom/atencao/critico para métricas onde MENOR é melhor (CMV, folha, ocupação) */
function gradeLower(pct: number | null, f: { bom: number; atencao: number }) {
  if (pct === null) return null
  if (pct <= f.bom) return 'bom'
  if (pct <= f.atencao) return 'atencao'
  return 'critico'
}
/** bom/atencao/critico para métricas onde MAIOR é melhor (margem líquida) */
function gradeHigher(pct: number | null, f: { bom: number; atencao: number }) {
  if (pct === null) return null
  if (pct >= f.bom) return 'bom'
  if (pct >= f.atencao) return 'atencao'
  return 'critico'
}

const GRADE_CLS: Record<string, string> = {
  bom: 'bg-green-50 border-green-300',
  atencao: 'bg-amber-50 border-amber-300',
  critico: 'bg-red-50 border-red-300',
}
const GRADE_DOT: Record<string, string> = { bom: 'bg-green-500', atencao: 'bg-amber-500', critico: 'bg-red-500' }

export function IndicadoresTab() {
  const now = new Date()
  const queryClient = useQueryClient()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [regime, setRegime] = useState<'competencia' | 'caixa'>('competencia')
  const [faixasOpen, setFaixasOpen] = useState(false)
  const { from, to } = monthRange(year, month)

  const { data: dre = {} } = useQuery({
    queryKey: ['acc-dre', from, to, regime],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('acc_dre', { p_from: from, p_to: to, p_regime: regime })
      if (error) throw error
      return Object.fromEntries(((data ?? []) as { bucket: string; amount: number }[]).map((r) => [r.bucket, Number(r.amount)])) as Buckets
    },
  })

  // Saldos patrimoniais até o fim do período (ativo/passivo circulante, caixa)
  const { data: patrimonial } = useQuery({
    queryKey: ['acc-patrimonial', to, regime],
    queryFn: async () => {
      const [{ data: tb }, { data: accounts }] = await Promise.all([
        supabase.rpc('acc_trial_balance', { p_from: to, p_to: to, p_regime: regime }),
        supabase.from('acc_accounts').select('id, code, nature'),
      ])
      const accById = new Map((accounts ?? []).map((a: { id: string; code: string; nature: string }) => [a.id, a]))
      let caixa = 0, ativoCirc = 0, passivoCirc = 0, estoque = 0
      for (const r of (tb ?? []) as TBRow[]) {
        const a = accById.get(r.account_id)
        if (!a) continue
        const bal = a.nature === 'D'
          ? Number(r.prev_debits) + Number(r.debits) - Number(r.prev_credits) - Number(r.credits)
          : Number(r.prev_credits) + Number(r.credits) - Number(r.prev_debits) - Number(r.debits)
        if (a.code.startsWith('1.1.')) caixa += bal
        if (/^1\.[1-4]\./.test(a.code)) ativoCirc += bal
        if (a.code.startsWith('1.3.')) estoque += bal
        if (/^2\.[1-5]\./.test(a.code)) passivoCirc += bal
      }
      return { caixa, ativoCirc, passivoCirc, estoque }
    },
  })

  // Pedidos do período (ticket médio) e contas em aberto
  const { data: orderStats } = useQuery({
    queryKey: ['orders-stats', from, to],
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('total').eq('status', 'paid')
        .gte('closed_at', `${from}T00:00:00`).lte('closed_at', `${to}T23:59:59`)
      const totals = (data ?? []).map((o) => Number(o.total))
      return { count: totals.length, sum: totals.reduce((s, v) => s + v, 0) }
    },
  })
  const { data: finOpen } = useQuery({
    queryKey: ['fin-open-totals'],
    queryFn: async () => {
      const { data } = await supabase.from('financial_entries').select('type, amount').eq('paid', false)
      const pagar = (data ?? []).filter((e) => e.type === 'payment').reduce((s, e) => s + Number(e.amount), 0)
      const receber = (data ?? []).filter((e) => e.type === 'receipt').reduce((s, e) => s + Number(e.amount), 0)
      return { pagar, receber }
    },
  })

  const { data: faixas = DEFAULT_FAIXAS } = useQuery({
    queryKey: ['acc-faixas'],
    queryFn: async () => {
      const { data } = await supabase.from('acc_settings').select('value').eq('key', 'indicador_faixas').maybeSingle()
      return (data?.value as Faixas) ?? DEFAULT_FAIXAS
    },
  })

  const { data: series = [] } = useQuery({
    queryKey: ['acc-dre-series', regime],
    queryFn: async () => {
      const { data } = await supabase.rpc('acc_dre_series', { p_months: 12, p_regime: regime })
      return (data ?? []) as SeriesRow[]
    },
  })

  // ── Cálculos ──
  const m = useMemo(() => {
    const receitaBruta = g(dre, 'receita_vendas') + g(dre, 'outras_receitas')
    const deducoes = g(dre, 'deducoes') + g(dre, 'taxas_canal')
    const receitaLiquida = receitaBruta - deducoes
    const cmv = g(dre, 'cmv') + g(dre, 'perdas')
    const lucroBruto = receitaLiquida - cmv
    const pessoal = g(dre, 'pessoal')
    const ocupacao = g(dre, 'ocupacao')
    const operacionais = g(dre, 'comercial') + g(dre, 'administrativas')
    const resultadoOp = lucroBruto - pessoal - ocupacao - operacionais
    const lucroLiquido = resultadoOp - g(dre, 'financeiras') - g(dre, 'tributarias') - g(dre, 'outras_despesas')
    const despesasTotais = pessoal + ocupacao + operacionais + g(dre, 'financeiras') + g(dre, 'tributarias') + g(dre, 'outras_despesas')

    const pct = (v: number) => (receitaLiquida > 0 ? (v / receitaLiquida) * 100 : null)
    const margemContribuicao = receitaLiquida > 0 ? ((receitaLiquida - cmv) / receitaLiquida) : 0
    const pontoEquilibrio = margemContribuicao > 0 ? despesasTotais / margemContribuicao : null
    const capitalGiro = (patrimonial?.ativoCirc ?? 0) - (patrimonial?.passivoCirc ?? 0)
    const giroEstoque = (patrimonial?.estoque ?? 0) > 0 ? cmv / patrimonial!.estoque : null
    const ticket = orderStats && orderStats.count > 0 ? orderStats.sum / orderStats.count : null

    return {
      receitaBruta, receitaLiquida, cmv, lucroBruto, despesasOp: pessoal + ocupacao + operacionais,
      resultadoOp, lucroLiquido, perdas: g(dre, 'perdas'),
      cmvPct: pct(cmv), folhaPct: pct(pessoal), ocupacaoPct: pct(ocupacao),
      margemBruta: pct(lucroBruto), margemLiquida: pct(lucroLiquido),
      pontoEquilibrio, capitalGiro, giroEstoque, ticket,
    }
  }, [dre, patrimonial, orderStats])

  const chartData = useMemo(() => {
    const byMonth = new Map<string, Buckets>()
    for (const r of series) {
      const cur = byMonth.get(r.month) ?? {}
      cur[r.bucket] = Number(r.amount)
      byMonth.set(r.month, cur)
    }
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mo, b]) => {
      const rb = g(b, 'receita_vendas') + g(b, 'outras_receitas')
      const rl = rb - g(b, 'deducoes') - g(b, 'taxas_canal')
      const cmv = g(b, 'cmv') + g(b, 'perdas')
      const desp = g(b, 'pessoal') + g(b, 'ocupacao') + g(b, 'comercial') + g(b, 'administrativas') + g(b, 'financeiras') + g(b, 'tributarias') + g(b, 'outras_despesas')
      return {
        mes: `${mo.slice(5, 7)}/${mo.slice(2, 4)}`,
        Faturamento: rb,
        'CMV %': rl > 0 ? Number(((cmv / rl) * 100).toFixed(1)) : 0,
        'Margem Líq. %': rl > 0 ? Number((((rl - cmv - desp) / rl) * 100).toFixed(1)) : 0,
        Resultado: rl - cmv - desp,
      }
    })
  }, [series])

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i)

  const pctFmt = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`)

  const cards: { label: string; value: string; grade?: string | null; hint?: string }[] = [
    { label: 'Faturamento bruto', value: formatCurrency(m.receitaBruta) },
    { label: 'Receita líquida', value: formatCurrency(m.receitaLiquida) },
    { label: 'CMV', value: formatCurrency(m.cmv), grade: gradeLower(m.cmvPct, faixas.cmv), hint: `${pctFmt(m.cmvPct)} da receita líquida` },
    { label: 'Lucro bruto', value: formatCurrency(m.lucroBruto), hint: `Margem bruta: ${pctFmt(m.margemBruta)}` },
    { label: 'Despesas operacionais', value: formatCurrency(m.despesasOp) },
    { label: 'Folha / receita', value: pctFmt(m.folhaPct), grade: gradeLower(m.folhaPct, faixas.folha) },
    { label: 'Ocupação / receita', value: pctFmt(m.ocupacaoPct), grade: gradeLower(m.ocupacaoPct, faixas.ocupacao) },
    { label: 'Resultado operacional', value: formatCurrency(m.resultadoOp) },
    { label: 'Lucro líquido', value: formatCurrency(m.lucroLiquido), grade: gradeHigher(m.margemLiquida, faixas.margem_liquida), hint: `Margem líquida: ${pctFmt(m.margemLiquida)}` },
    { label: 'Saldo de caixa', value: formatCurrency(patrimonial?.caixa ?? 0) },
    { label: 'Contas a pagar', value: formatCurrency(finOpen?.pagar ?? 0), hint: 'em aberto' },
    { label: 'Contas a receber', value: formatCurrency(finOpen?.receber ?? 0), hint: 'em aberto' },
    { label: 'Ticket médio', value: m.ticket !== null ? formatCurrency(m.ticket) : '—', hint: `${orderStats?.count ?? 0} pedidos no período` },
    { label: 'Ponto de equilíbrio', value: m.pontoEquilibrio !== null ? formatCurrency(m.pontoEquilibrio) : '—', hint: 'receita mínima do período' },
    { label: 'Capital de giro', value: formatCurrency(m.capitalGiro) },
    { label: 'Giro de estoque', value: m.giroEstoque !== null ? `${m.giroEstoque.toFixed(2)}×` : '—', hint: 'CMV ÷ estoque' },
    { label: 'Perdas de estoque', value: formatCurrency(m.perdas) },
  ]

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS_PT.map((mo, i) => <SelectItem key={mo} value={String(i + 1)}>{mo}</SelectItem>)}</SelectContent>
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
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setFaixasOpen(true)}>
          <Settings2 className="w-4 h-4 mr-1" />
          Faixas de desempenho
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className={cn('border shadow-sm', c.grade && GRADE_CLS[c.grade])}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                {c.grade && <span className={cn('w-2 h-2 rounded-full', GRADE_DOT[c.grade])} title={c.grade} />}
              </div>
              <p className="text-base font-bold tabular-nums mt-0.5">{c.value}</p>
              {c.hint && <p className="text-[10px] text-muted-foreground mt-0.5">{c.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-3">Evolução — Faturamento e Resultado (12 meses)</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="mes" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={fmtShort} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Legend />
                <Bar dataKey="Faturamento" fill="#166534" />
                <Bar dataKey="Resultado" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-3">Evolução — CMV % e Margem Líquida % (12 meses)</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="mes" fontSize={11} />
                <YAxis fontSize={11} unit="%" />
                <Tooltip formatter={(v) => `${v}%`} />
                <Legend />
                <Line type="monotone" dataKey="CMV %" stroke="#dc2626" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Margem Líq. %" stroke="#166534" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <FaixasModal open={faixasOpen} faixas={faixas} onClose={() => setFaixasOpen(false)} onSaved={() => queryClient.invalidateQueries({ queryKey: ['acc-faixas'] })} />
    </div>
  )
}

// ── Configuração das faixas ─────────────────────────────────────────────────

function FaixasModal({ open, faixas, onClose, onSaved }: {
  open: boolean
  faixas: Faixas
  onClose: () => void
  onSaved: () => void
}) {
  const [local, setLocal] = useState<Faixas>(faixas)
  const [saving, setSaving] = useState(false)

  const rows: { key: keyof Faixas; label: string; dir: string }[] = [
    { key: 'cmv', label: 'CMV / receita líquida', dir: 'menor é melhor' },
    { key: 'folha', label: 'Folha / receita líquida', dir: 'menor é melhor' },
    { key: 'ocupacao', label: 'Ocupação / receita líquida', dir: 'menor é melhor' },
    { key: 'margem_liquida', label: 'Margem líquida', dir: 'maior é melhor' },
  ]

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.from('acc_settings').upsert({ key: 'indicador_faixas', value: local })
    setSaving(false)
    if (error) { alert(`Erro: ${error.message}`); return }
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); else setLocal(faixas) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Faixas de desempenho (%)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.key} className="space-y-1">
              <Label className="text-sm">{r.label} <span className="text-xs text-muted-foreground font-normal">({r.dir})</span></Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-muted-foreground">Bom {r.dir.startsWith('menor') ? 'até' : 'a partir de'}</span>
                  <Input type="number" step="0.1" value={local[r.key].bom}
                    onChange={(e) => setLocal((f) => ({ ...f, [r.key]: { ...f[r.key], bom: Number(e.target.value) } }))} />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Atenção {r.dir.startsWith('menor') ? 'até' : 'a partir de'}</span>
                  <Input type="number" step="0.1" value={local[r.key].atencao}
                    onChange={(e) => setLocal((f) => ({ ...f, [r.key]: { ...f[r.key], atencao: Number(e.target.value) } }))} />
                </div>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Fora da faixa de atenção, o indicador é marcado como crítico.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
