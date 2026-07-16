import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Wand2, Trash2, Landmark } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { MONTHS_PT, monthRange } from './accUtils'

interface Recon {
  id: string
  kind: 'caixa' | 'banco' | 'pix' | 'cartao' | 'delivery'
  ref_month: string
  description: string | null
  expected: number
  actual: number | null
  fee: number
  expected_date: string | null
  actual_date: string | null
  status: 'pendente' | 'conciliado' | 'divergente' | 'nao_localizado'
  notes: string | null
}
interface FlowRow { day: string; account_code: string; inflow: number; outflow: number }

const KIND_LABELS: Record<Recon['kind'], string> = {
  caixa: 'Caixa', banco: 'Banco', pix: 'PIX', cartao: 'Cartão', delivery: 'Delivery',
}
const STATUS_UI: Record<Recon['status'], { label: string; cls: string }> = {
  pendente:       { label: 'Pendente',       cls: 'bg-amber-100 text-amber-700' },
  conciliado:     { label: 'Conciliado',     cls: 'bg-green-100 text-green-700' },
  divergente:     { label: 'Divergente',     cls: 'bg-red-100 text-red-700' },
  nao_localizado: { label: 'Não localizado', cls: 'bg-gray-200 text-gray-700' },
}

/** diferença = (recebido + taxa) − registrado; zero = conciliado */
function diffOf(r: { expected: number; actual: number | null; fee: number }): number | null {
  if (r.actual === null || r.actual === undefined) return null
  return Math.round(((Number(r.actual) + Number(r.fee)) - Number(r.expected)) * 100) / 100
}

export function ConciliacaoTab() {
  const now = new Date()
  const queryClient = useQueryClient()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [addOpen, setAddOpen] = useState(false)
  const refMonth = `${year}-${String(month).padStart(2, '0')}-01`
  const { from, to } = monthRange(year, month)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['acc-recon', refMonth],
    queryFn: async () => {
      const { data, error } = await supabase.from('acc_reconciliations').select('*').eq('ref_month', refMonth).order('kind').order('created_at')
      if (error) throw error
      return data as Recon[]
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['acc-recon'] })

  /** Gera itens do mês a partir das entradas registradas nas contas de caixa */
  async function handleGenerate() {
    const { data } = await supabase.rpc('acc_cash_flow', { p_from: from, p_to: to })
    const flows = (data ?? []) as FlowRow[]
    const sums: Record<string, number> = {}
    for (const f of flows) sums[f.account_code] = (sums[f.account_code] ?? 0) + Number(f.inflow)

    const wanted: { kind: Recon['kind']; code: string; desc: string }[] = [
      { kind: 'caixa', code: '1.1.1', desc: 'Entradas no caixa do restaurante' },
      { kind: 'delivery', code: '1.1.2', desc: 'Entradas no caixa do delivery' },
      { kind: 'banco', code: '1.1.3', desc: 'Entradas em bancos' },
    ]
    const rows = wanted
      .filter((w) => (sums[w.code] ?? 0) > 0)
      .filter((w) => !items.some((i) => i.kind === w.kind && i.description === w.desc))
      .map((w) => ({
        kind: w.kind, ref_month: refMonth, description: w.desc,
        expected: Math.round((sums[w.code] ?? 0) * 100) / 100,
        expected_date: to,
      }))
    if (rows.length === 0) { alert('Nada novo a gerar: sem entradas registradas no período ou itens já criados.'); return }
    const { error } = await supabase.from('acc_reconciliations').insert(rows)
    if (error) { alert(`Erro: ${error.message}`); return }
    invalidate()
  }

  async function saveField(r: Recon, patch: Partial<Recon>) {
    const merged = { ...r, ...patch }
    const d = diffOf(merged)
    const status: Recon['status'] = merged.status === 'nao_localizado'
      ? 'nao_localizado'
      : d === null ? 'pendente' : Math.abs(d) < 0.01 ? 'conciliado' : 'divergente'
    const { error } = await supabase.from('acc_reconciliations')
      .update({ ...patch, status, updated_at: new Date().toISOString() })
      .eq('id', r.id)
    if (error) { alert(`Erro: ${error.message}`); return }
    invalidate()
  }

  async function handleDelete(r: Recon) {
    if (!confirm(`Excluir o item de conciliação "${r.description ?? KIND_LABELS[r.kind]}"?`)) return
    await supabase.from('acc_reconciliations').delete().eq('id', r.id)
    invalidate()
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">Conciliação</h2>
        <div className="flex gap-2 ml-auto">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS_PT.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handleGenerate}>
            <Wand2 className="w-4 h-4 mr-1" />
            Gerar itens do mês
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Item manual
          </Button>
        </div>
      </div>

      {isLoading && <div className="h-40 rounded-lg bg-muted animate-pulse" />}

      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center py-14 text-muted-foreground gap-2">
          <Landmark className="w-10 h-10 opacity-30" />
          <p className="text-sm">Nenhum item de conciliação em {MONTHS_PT[month - 1]}/{year}.</p>
          <p className="text-xs">Use "Gerar itens do mês" para criar a partir das entradas registradas.</p>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="bg-muted/60 text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">Tipo</th>
                <th className="text-left px-3 py-2 font-medium">Descrição</th>
                <th className="text-right px-3 py-2 font-medium" title="Registrado no sistema">Registrado</th>
                <th className="text-right px-3 py-2 font-medium" title="Valor efetivamente recebido">Recebido</th>
                <th className="text-right px-3 py-2 font-medium">Taxa</th>
                <th className="text-right px-3 py-2 font-medium">Diferença</th>
                <th className="text-center px-3 py-2 font-medium">Situação</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((r) => {
                const d = diffOf(r)
                return (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-3 py-1.5"><Badge variant="outline" className="text-[10px]">{KIND_LABELS[r.kind]}</Badge></td>
                    <td className="px-3 py-1.5 max-w-52 truncate">{r.description ?? '—'}</td>
                    <td className="text-right px-3 py-1.5 tabular-nums">{formatCurrency(Number(r.expected))}</td>
                    <td className="text-right px-3 py-1.5 w-32">
                      <Input
                        defaultValue={r.actual !== null ? String(r.actual) : ''}
                        placeholder="0,00"
                        inputMode="decimal"
                        className="h-7 text-right text-sm"
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          const n = v === '' ? null : parseFloat(v.replace(',', '.'))
                          if (n !== r.actual && !(v !== '' && isNaN(n as number))) {
                            saveField(r, { actual: n, actual_date: n !== null ? new Date().toISOString().split('T')[0] : null })
                          }
                        }}
                      />
                    </td>
                    <td className="text-right px-3 py-1.5 w-24">
                      <Input
                        defaultValue={Number(r.fee) ? String(r.fee) : ''}
                        placeholder="0,00"
                        inputMode="decimal"
                        className="h-7 text-right text-sm"
                        onBlur={(e) => {
                          const n = parseFloat(e.target.value.replace(',', '.')) || 0
                          if (n !== Number(r.fee)) saveField(r, { fee: n })
                        }}
                      />
                    </td>
                    <td className={cn('text-right px-3 py-1.5 tabular-nums font-medium', d !== null && Math.abs(d) >= 0.01 && 'text-red-600')}>
                      {d !== null ? formatCurrency(d) : '—'}
                    </td>
                    <td className="text-center px-3 py-1.5">
                      <button
                        title="Alternar para 'não localizado'"
                        onClick={() => saveField(r, { status: r.status === 'nao_localizado' ? 'pendente' : 'nao_localizado' } as Partial<Recon>)}
                        className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', STATUS_UI[r.status].cls)}
                      >
                        {STATUS_UI[r.status].label}
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(r)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Diferença = (recebido + taxa) − registrado. Zero concilia automaticamente; qualquer valor marca como divergente.
        PIX e Cartão podem ser adicionados manualmente com os valores dos extratos das operadoras.
      </p>

      <AddReconModal open={addOpen} refMonth={refMonth} onClose={() => setAddOpen(false)} onSaved={invalidate} />
    </div>
  )
}

function AddReconModal({ open, refMonth, onClose, onSaved }: {
  open: boolean
  refMonth: string
  onClose: () => void
  onSaved: () => void
}) {
  const [kind, setKind] = useState<Recon['kind']>('cartao')
  const [description, setDescription] = useState('')
  const [expected, setExpected] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const v = parseFloat(expected.replace(',', '.'))
    if (!description.trim() || isNaN(v)) { alert('Informe descrição e valor registrado.'); return }
    setSaving(true)
    const { error } = await supabase.from('acc_reconciliations').insert({
      kind, ref_month: refMonth, description: description.trim(), expected: v,
    })
    setSaving(false)
    if (error) { alert(`Erro: ${error.message}`); return }
    setDescription(''); setExpected('')
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Item de conciliação</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Recon['kind'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABELS) as Recon['kind'][]).map((k) => (
                  <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Vendas no cartão — Stone" />
          </div>
          <div className="space-y-1.5">
            <Label>Valor registrado (R$) *</Label>
            <Input value={expected} onChange={(e) => setExpected(e.target.value)} inputMode="decimal" placeholder="0,00" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Adicionar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
