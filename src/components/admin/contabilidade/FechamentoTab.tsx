import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Lock, LockOpen, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { MONTHS_PT } from './accUtils'

interface Period { id: string; year: number; month: number; status: string; closed_at: string | null; reopen_reason: string | null }
interface Summary { vendas: number; vendas_total: number; baixas: number; lancamentos: number; pendentes: number; estornos: number }

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  aberto:          { label: 'Aberto',          cls: 'bg-green-100 text-green-700' },
  em_conferencia:  { label: 'Em conferência',  cls: 'bg-blue-100 text-blue-700' },
  pendente:        { label: 'Pendente',        cls: 'bg-amber-100 text-amber-700' },
  fechado:         { label: 'Fechado',         cls: 'bg-gray-200 text-gray-700' },
  reaberto:        { label: 'Reaberto',        cls: 'bg-purple-100 text-purple-700' },
}

export function FechamentoTab() {
  const now = new Date()
  const queryClient = useQueryClient()
  const [year, setYear] = useState(now.getFullYear())
  const [selected, setSelected] = useState(now.getMonth() + 1)
  const [busy, setBusy] = useState(false)

  const { data: periods = [] } = useQuery({
    queryKey: ['acc-periods', year],
    queryFn: async () => {
      const { data } = await supabase.from('acc_periods').select('*').eq('year', year)
      return (data ?? []) as Period[]
    },
  })

  const { data: summary } = useQuery({
    queryKey: ['acc-period-summary', year, selected],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('acc_period_summary', { p_year: year, p_month: selected })
      if (error) throw error
      return (data as Summary[])[0]
    },
  })

  const statusOf = (m: number) => periods.find((p) => p.month === m)?.status ?? 'aberto'
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['acc-periods'] })
    queryClient.invalidateQueries({ queryKey: ['acc-period-summary'] })
  }

  async function handleClose() {
    if (!confirm(`Fechar a competência ${MONTHS_PT[selected - 1]}/${year}?\n\nApós o fechamento, nenhum lançamento poderá ser feito neste mês (somente com reabertura justificada).`)) return
    setBusy(true)
    const { error } = await supabase.rpc('acc_close_period', { p_year: year, p_month: selected })
    setBusy(false)
    if (error) { alert(error.message); return }
    invalidate()
  }

  async function handleReopen() {
    const reason = prompt(`Reabrir a competência ${MONTHS_PT[selected - 1]}/${year}?\n\nInforme a justificativa (obrigatória, ficará registrada no log):`)
    if (reason === null) return
    setBusy(true)
    const { error } = await supabase.rpc('acc_reopen_period', { p_year: year, p_month: selected, p_reason: reason })
    setBusy(false)
    if (error) { alert(error.message); return }
    invalidate()
  }

  const selStatus = statusOf(selected)
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i)

  const checklist = summary ? [
    { label: 'Vendas do mês', value: `${summary.vendas} venda(s) — ${formatCurrency(Number(summary.vendas_total))}`, ok: true },
    { label: 'Baixas no Financeiro', value: `${summary.baixas} baixa(s)`, ok: true },
    { label: 'Lançamentos contabilizados', value: String(summary.lancamentos), ok: true },
    { label: 'Lançamentos pendentes de validação', value: String(summary.pendentes), ok: summary.pendentes === 0 },
    { label: 'Estornos no mês', value: String(summary.estornos), ok: true },
  ] : []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Fechamento Mensal</h2>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-24 ml-auto"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Grade de meses */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {MONTHS_PT.map((m, i) => {
          const st = statusOf(i + 1)
          return (
            <button
              key={m}
              onClick={() => setSelected(i + 1)}
              className={cn(
                'rounded-lg border p-2.5 text-left transition-shadow hover:shadow-sm',
                selected === i + 1 && 'ring-2 ring-primary border-primary'
              )}
            >
              <p className="text-sm font-medium">{m}</p>
              <span className={cn('inline-block text-[10px] px-2 py-0.5 rounded-full font-medium mt-1', STATUS_UI[st].cls)}>
                {STATUS_UI[st].label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Detalhe da competência selecionada */}
      <Card className="border shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="font-semibold">
              Competência {MONTHS_PT[selected - 1]}/{year}
              <span className={cn('ml-2 text-[10px] px-2 py-0.5 rounded-full font-medium align-middle', STATUS_UI[selStatus].cls)}>
                {STATUS_UI[selStatus].label}
              </span>
            </p>
            {selStatus === 'fechado' ? (
              <Button size="sm" variant="outline" onClick={handleReopen} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><LockOpen className="w-4 h-4 mr-1" />Reabrir competência</>}
              </Button>
            ) : (
              <Button size="sm" onClick={handleClose} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Lock className="w-4 h-4 mr-1" />Fechar competência</>}
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            {checklist.map((c) => (
              <div key={c.label} className="flex items-center gap-2 text-sm">
                {c.ok
                  ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
                <span className="flex-1">{c.label}</span>
                <span className={cn('font-medium', !c.ok && 'text-amber-700')}>{c.value}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            O fechamento valida automaticamente: ausência de lançamentos pendentes e a equação
            Ativo = Passivo + PL + Resultado. Se houver problema, o fechamento é bloqueado com a
            explicação. Após fechado, o mês não aceita novos lançamentos; reabertura exige
            justificativa e fica registrada no log.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
