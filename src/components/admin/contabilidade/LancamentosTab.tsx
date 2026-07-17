import { useMemo, useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Minus, Undo2, ChevronDown, ChevronRight, BookOpenText, Loader2, Check, Pencil, Trash2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { MONTHS_PT, monthRange, sortAccounts } from './accUtils'
import type { AccAccount, AccCostCenter, AccEntry, AccEntryStatus, AccNature } from '@/types/database'

const STATUS_UI: Record<AccEntryStatus, { label: string; className: string }> = {
  rascunho:      { label: 'Rascunho',      className: 'bg-gray-100 text-gray-700' },
  pendente:      { label: 'Pendente',      className: 'bg-amber-100 text-amber-700' },
  aprovado:      { label: 'Aprovado',      className: 'bg-blue-100 text-blue-700' },
  contabilizado: { label: 'Contabilizado', className: 'bg-green-100 text-green-700' },
  estornado:     { label: 'Estornado',     className: 'bg-red-100 text-red-700' },
}

const ORIGIN_LABELS: Record<string, string> = {
  manual: 'Manual', estorno: 'Estorno', venda: 'Venda', cmv: 'CMV', financeiro: 'Financeiro',
}

interface FormLine { account_id: string; side: AccNature; amount: string }

export function LancamentosTab() {
  const queryClient = useQueryClient()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [statusFilter, setStatusFilter] = useState('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [adjusting, setAdjusting] = useState<AccEntry | null>(null)
  const [editing, setEditing] = useState<AccEntry | null>(null)

  const { from, to } = monthRange(year, month)

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['acc-entries', year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acc_entries')
        .select('*, acc_entry_lines(*, acc_accounts(id, code, name))')
        .gte('competence_date', from)
        .lte('competence_date', to)
        .order('competence_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as AccEntry[]
    },
  })

  const { data: costCenters = [] } = useQuery({
    queryKey: ['acc-cost-centers'],
    queryFn: async () => {
      const { data } = await supabase.from('acc_cost_centers').select('*').order('name')
      return (data ?? []) as AccCostCenter[]
    },
  })
  const ccName = (id: string | null) => costCenters.find((c) => c.id === id)?.name

  const filtered = entries.filter((e) => statusFilter === 'all' || e.status === statusFilter)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['acc-entries'] })
    queryClient.invalidateQueries({ queryKey: ['acc-trial-balance'] })
  }

  async function handleReverse(e: AccEntry) {
    const reason = prompt(`Estornar o lançamento "${e.history}"?\n\nInforme a justificativa do estorno:`)
    if (reason === null) return
    if (!reason.trim()) { alert('A justificativa é obrigatória.'); return }
    const { error } = await supabase.rpc('acc_reverse_entry', { p_entry_id: e.id, p_reason: reason.trim() })
    if (error) { alert(`Erro ao estornar: ${error.message}`); return }
    invalidate()
  }

  async function handleApprove(e: AccEntry) {
    const { error } = await supabase.from('acc_entries').update({ status: 'contabilizado', updated_at: new Date().toISOString() }).eq('id', e.id)
    if (error) { alert(`Erro: ${error.message}`); return }
    invalidate()
  }

  async function handleDiscard(e: AccEntry) {
    if (!confirm(`Descartar a sugestão "${e.history}"?\n\nEla não entrará na contabilidade. (A baixa no Financeiro não é alterada.)`)) return
    const { error } = await supabase.from('acc_entries').delete().eq('id', e.id)
    if (error) { alert(`Erro: ${error.message}`); return }
    invalidate()
  }

  function entryTotal(e: AccEntry): number {
    return (e.acc_entry_lines ?? []).filter((l) => l.side === 'D').reduce((s, l) => s + Number(l.amount), 0)
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">Lançamentos Contábeis</h2>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Novo Lançamento
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS_PT.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {(Object.keys(STATUS_UI) as AccEntryStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_UI[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(() => { const pend = entries.filter((e) => e.status === 'pendente').length; return pend > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 flex items-center gap-2">
          <BookOpenText className="w-4 h-4 shrink-0" />
          <span><span className="font-bold">{pend} lançamento{pend !== 1 ? 's' : ''}</span> gerado{pend !== 1 ? 's' : ''} do Financeiro aguardando validação — contabilize, ajuste a classificação ou descarte.</span>
        </div>
      ) : null })()}

      {isLoading && <div className="h-48 rounded-lg bg-muted animate-pulse" />}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center py-14 text-muted-foreground gap-2">
          <BookOpenText className="w-10 h-10 opacity-30" />
          <p className="text-sm">Nenhum lançamento em {MONTHS_PT[month - 1]}/{year}.</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((e) => (
          <div key={e.id} className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40" onClick={() => toggleExpand(e.id)}>
              {expanded.has(e.id) ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
              <span className="text-xs text-muted-foreground shrink-0 w-20">{e.competence_date.split('-').reverse().join('/')}</span>
              <span className="flex-1 truncate font-medium">{e.history}</span>
              {e.document && <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">doc: {e.document}</span>}
              <Badge variant="outline" className="text-[10px] shrink-0">{ORIGIN_LABELS[e.origin] ?? e.origin}</Badge>
              <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0', STATUS_UI[e.status].className)}>
                {STATUS_UI[e.status].label}
              </span>
              <span className="font-semibold tabular-nums shrink-0">{formatCurrency(entryTotal(e))}</span>
              {e.status === 'pendente' && (
                <span className="flex gap-1 shrink-0" onClick={(ev) => ev.stopPropagation()}>
                  <Button size="sm" className="h-7 px-2 text-xs" title="Validar e contabilizar como está" onClick={() => handleApprove(e)}>
                    <Check className="w-3.5 h-3.5 mr-1" />Contabilizar
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" title="Ajustar contas antes de contabilizar" onClick={() => setAdjusting(e)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="Descartar sugestão" onClick={() => handleDiscard(e)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </span>
              )}
              {e.status !== 'pendente' && e.status !== 'estornado' && (
                <span className="flex gap-1 shrink-0" onClick={(ev) => ev.stopPropagation()}>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Editar lançamento" onClick={() => setEditing(e)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  {e.origin !== 'estorno' && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="Estornar" onClick={() => handleReverse(e)}>
                      <Undo2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </span>
              )}
            </div>
            {expanded.has(e.id) && (
              <div className="border-t bg-muted/20 px-4 py-2 text-xs space-y-1">
                {(e.acc_entry_lines ?? []).sort((a, b) => a.side.localeCompare(b.side)).map((l) => (
                  <div key={l.id} className="flex items-center gap-2">
                    <Badge variant={l.side === 'D' ? 'default' : 'secondary'} className="text-[10px] w-5 justify-center p-0">{l.side}</Badge>
                    <span className="font-mono text-muted-foreground">{l.acc_accounts?.code}</span>
                    <span className="flex-1 truncate">{l.acc_accounts?.name}</span>
                    <span className="tabular-nums">{formatCurrency(Number(l.amount))}</span>
                  </div>
                ))}
                <div className="flex gap-4 pt-1 text-muted-foreground">
                  {e.cash_date && <span>Caixa: {e.cash_date.split('-').reverse().join('/')}</span>}
                  {e.cost_center_id && <span>Centro de custo: {ccName(e.cost_center_id)}</span>}
                  {e.notes && <span className="italic truncate">Obs.: {e.notes}</span>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <NovoLancamentoModal
        open={modalOpen}
        costCenters={costCenters}
        onClose={() => setModalOpen(false)}
        onSaved={invalidate}
      />

      <AjustarLancamentoModal
        entry={adjusting}
        costCenters={costCenters}
        onClose={() => setAdjusting(null)}
        onSaved={invalidate}
      />

      <EditarLancamentoModal
        entry={editing}
        costCenters={costCenters}
        onClose={() => setEditing(null)}
        onSaved={invalidate}
      />
    </div>
  )
}

// ── Ajustar sugestão vinda do Financeiro (troca de contas) ──────────────────

function AjustarLancamentoModal({ entry, costCenters, onClose, onSaved }: {
  entry: AccEntry | null
  costCenters: AccCostCenter[]
  onClose: () => void
  onSaved: () => void
}) {
  const [history, setHistory] = useState('')
  const [costCenter, setCostCenter] = useState('')
  const [lineAccounts, setLineAccounts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const { data: accounts = [] } = useQuery({
    queryKey: ['acc-accounts-analytic'],
    enabled: !!entry,
    queryFn: async () => {
      const { data } = await supabase.from('acc_accounts').select('*').eq('allows_entries', true).eq('active', true)
      return sortAccounts((data ?? []) as AccAccount[])
    },
  })

  useEffect(() => {
    if (entry) {
      setHistory(entry.history)
      setCostCenter(entry.cost_center_id ?? '')
      setLineAccounts(Object.fromEntries((entry.acc_entry_lines ?? []).map((l) => [l.id, l.account_id])))
    }
  }, [entry])

  async function handleSave() {
    if (!entry) return
    setSaving(true)
    for (const l of entry.acc_entry_lines ?? []) {
      const acc = lineAccounts[l.id]
      if (acc && acc !== l.account_id) {
        const { error } = await supabase.from('acc_entry_lines').update({ account_id: acc }).eq('id', l.id)
        if (error) { alert(`Erro: ${error.message}`); setSaving(false); return }
      }
    }
    const { error } = await supabase.from('acc_entries').update({
      history: history.trim() || entry.history,
      cost_center_id: costCenter || null,
      status: 'contabilizado',
      updated_at: new Date().toISOString(),
    }).eq('id', entry.id)
    setSaving(false)
    if (error) { alert(`Erro: ${error.message}`); return }
    onSaved()
    onClose()
  }

  return (
    <Dialog open={!!entry} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Ajustar e contabilizar</DialogTitle>
        </DialogHeader>
        {entry && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Histórico</Label>
              <Input value={history} onChange={(e) => setHistory(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Centro de custo</Label>
              <Select value={costCenter || '__none__'} onValueChange={(v) => setCostCenter(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {costCenters.filter((c) => c.active).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Partidas (ajuste a conta se necessário)</Label>
              {(entry.acc_entry_lines ?? []).sort((a, b) => a.side.localeCompare(b.side)).map((l) => (
                <div key={l.id} className="flex items-center gap-2">
                  <Badge variant={l.side === 'D' ? 'default' : 'secondary'} className="text-[10px] w-14 justify-center shrink-0">
                    {l.side === 'D' ? 'Débito' : 'Crédito'}
                  </Badge>
                  <Select value={lineAccounts[l.id] ?? l.account_id} onValueChange={(v) => setLineAccounts((prev) => ({ ...prev, [l.id]: v }))}>
                    <SelectTrigger className="flex-1 min-w-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <span className="font-medium tabular-nums shrink-0 w-24 text-right">{formatCurrency(Number(l.amount))}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              O valor vem da baixa no Financeiro e não é alterado aqui. Ao salvar, o lançamento é contabilizado.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar e contabilizar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Editar lançamento (admin) — cabeçalho e partidas completas ─────────────

interface EditLine { id?: string; account_id: string; side: AccNature; amount: string }

function EditarLancamentoModal({ entry, costCenters, onClose, onSaved }: {
  entry: AccEntry | null
  costCenters: AccCostCenter[]
  onClose: () => void
  onSaved: () => void
}) {
  const [competence, setCompetence] = useState('')
  const [cashDate, setCashDate] = useState('')
  const [history, setHistory] = useState('')
  const [document, setDocument] = useState('')
  const [costCenter, setCostCenter] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<EditLine[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { data: accounts = [] } = useQuery({
    queryKey: ['acc-accounts-analytic'],
    enabled: !!entry,
    queryFn: async () => {
      const { data } = await supabase.from('acc_accounts').select('*').eq('allows_entries', true).eq('active', true)
      return sortAccounts((data ?? []) as AccAccount[])
    },
  })

  useEffect(() => {
    if (entry) {
      setCompetence(entry.competence_date)
      setCashDate(entry.cash_date ?? '')
      setHistory(entry.history)
      setDocument(entry.document ?? '')
      setCostCenter(entry.cost_center_id ?? '')
      setNotes(entry.notes ?? '')
      setLines((entry.acc_entry_lines ?? []).map((l) => ({ id: l.id, account_id: l.account_id, side: l.side, amount: String(l.amount) })))
      setError('')
    }
  }, [entry])

  const totals = useMemo(() => {
    const d = lines.filter((l) => l.side === 'D').reduce((s, l) => s + (parseFloat(l.amount.replace(',', '.')) || 0), 0)
    const c = lines.filter((l) => l.side === 'C').reduce((s, l) => s + (parseFloat(l.amount.replace(',', '.')) || 0), 0)
    return { d, c, diff: Math.round((d - c) * 100) / 100 }
  }, [lines])

  function setLine(i: number, patch: Partial<EditLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function handleSave() {
    if (!entry) return
    setError('')
    if (!history.trim()) { setError('Informe o histórico do lançamento.'); return }
    if (!competence) { setError('Informe a competência.'); return }
    if (lines.some((l) => !l.account_id || !(parseFloat(l.amount.replace(',', '.')) > 0))) {
      setError('Preencha conta e valor de todas as partidas.'); return
    }
    if (totals.diff !== 0 || totals.d === 0) { setError('Débitos e créditos precisam ser iguais e maiores que zero.'); return }

    setSaving(true)
    try {
      const { error: hErr } = await supabase.from('acc_entries').update({
        competence_date: competence,
        cash_date: cashDate || null,
        history: history.trim(),
        document: document.trim() || null,
        cost_center_id: costCenter || null,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', entry.id)
      if (hErr) throw hErr

      const originalIds = new Set((entry.acc_entry_lines ?? []).map((l) => l.id))
      const keptIds = new Set(lines.filter((l) => l.id).map((l) => l.id!))
      const removedIds = [...originalIds].filter((id) => !keptIds.has(id))
      if (removedIds.length) {
        const { error: dErr } = await supabase.from('acc_entry_lines').delete().in('id', removedIds)
        if (dErr) throw dErr
      }

      for (const l of lines) {
        const amount = parseFloat(l.amount.replace(',', '.'))
        if (l.id) {
          const { error: uErr } = await supabase.from('acc_entry_lines')
            .update({ account_id: l.account_id, side: l.side, amount, cost_center_id: costCenter || null })
            .eq('id', l.id)
          if (uErr) throw uErr
        } else {
          const { error: iErr } = await supabase.from('acc_entry_lines')
            .insert({ entry_id: entry.id, account_id: l.account_id, side: l.side, amount, cost_center_id: costCenter || null })
          if (iErr) throw iErr
        }
      }

      await supabase.from('acc_logs').insert({
        action: 'editar', entity: 'lancamento', entity_id: entry.id,
        detail: { historico: history.trim() },
      })

      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!entry} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Lançamento</DialogTitle>
        </DialogHeader>

        {entry && (
          <div className="space-y-3">
            {entry.origin !== 'manual' && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                Este lançamento foi gerado automaticamente (origem: {ORIGIN_LABELS[entry.origin] ?? entry.origin}).
                Editar aqui não altera o registro original que o gerou.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Competência *</Label>
                <Input type="date" value={competence} onChange={(e) => setCompetence(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Data de caixa</Label>
                <Input type="date" value={cashDate} onChange={(e) => setCashDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Histórico *</Label>
              <Input value={history} onChange={(e) => setHistory(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Documento</Label>
                <Input value={document} onChange={(e) => setDocument(e.target.value)} placeholder="NF, recibo, boleto..." />
              </div>
              <div className="space-y-1.5">
                <Label>Centro de custo</Label>
                <Select value={costCenter || '__none__'} onValueChange={(v) => setCostCenter(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {costCenters.filter((c) => c.active).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Partidas *</Label>
              <div className="space-y-2">
                {lines.map((l, i) => (
                  <div key={l.id ?? `new-${i}`} className="flex gap-2 items-center">
                    <Select value={l.side} onValueChange={(v) => setLine(i, { side: v as AccNature })}>
                      <SelectTrigger className="w-20 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="D">Débito</SelectItem>
                        <SelectItem value="C">Crédito</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={l.account_id} onValueChange={(v) => setLine(i, { account_id: v })}>
                      <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder="Selecionar conta..." /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={l.amount}
                      onChange={(e) => setLine(i, { amount: e.target.value })}
                      placeholder="0,00"
                      inputMode="decimal"
                      className="w-28 shrink-0 text-right"
                    />
                    <Button
                      size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0 text-destructive"
                      disabled={lines.length <= 2}
                      onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => setLines((prev) => [...prev, { account_id: '', side: 'D', amount: '' }])}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Adicionar partida
              </Button>
            </div>

            <div className={cn('rounded-lg border p-3 text-sm flex gap-6 justify-end', totals.diff === 0 && totals.d > 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200')}>
              <span>Débitos: <span className="font-bold tabular-nums">{formatCurrency(totals.d)}</span></span>
              <span>Créditos: <span className="font-bold tabular-nums">{formatCurrency(totals.c)}</span></span>
              <span>Diferença: <span className={cn('font-bold tabular-nums', totals.diff !== 0 && 'text-destructive')}>{formatCurrency(Math.abs(totals.diff))}</span></span>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || totals.diff !== 0 || totals.d === 0}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar alterações'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Modal de novo lançamento (partidas dobradas) ────────────────────────────

function NovoLancamentoModal({ open, costCenters, onClose, onSaved }: {
  open: boolean
  costCenters: AccCostCenter[]
  onClose: () => void
  onSaved: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [competence, setCompetence] = useState(today)
  const [cashDate, setCashDate] = useState(today)
  const [history, setHistory] = useState('')
  const [document, setDocument] = useState('')
  const [costCenter, setCostCenter] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<FormLine[]>([
    { account_id: '', side: 'D', amount: '' },
    { account_id: '', side: 'C', amount: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { data: accounts = [] } = useQuery({
    queryKey: ['acc-accounts-analytic'],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from('acc_accounts').select('*').eq('allows_entries', true).eq('active', true)
      return sortAccounts((data ?? []) as AccAccount[])
    },
  })

  useEffect(() => {
    if (open) {
      setCompetence(today); setCashDate(today); setHistory(''); setDocument('')
      setCostCenter(''); setNotes(''); setError('')
      setLines([{ account_id: '', side: 'D', amount: '' }, { account_id: '', side: 'C', amount: '' }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const totals = useMemo(() => {
    const d = lines.filter((l) => l.side === 'D').reduce((s, l) => s + (parseFloat(l.amount.replace(',', '.')) || 0), 0)
    const c = lines.filter((l) => l.side === 'C').reduce((s, l) => s + (parseFloat(l.amount.replace(',', '.')) || 0), 0)
    return { d, c, diff: Math.round((d - c) * 100) / 100 }
  }, [lines])

  function setLine(i: number, patch: Partial<FormLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function handleSave() {
    setError('')
    if (!history.trim()) { setError('Informe o histórico do lançamento.'); return }
    if (lines.some((l) => !l.account_id || !(parseFloat(l.amount.replace(',', '.')) > 0))) {
      setError('Preencha conta e valor de todas as partidas.'); return
    }
    if (totals.diff !== 0 || totals.d === 0) { setError('Débitos e créditos precisam ser iguais e maiores que zero.'); return }

    setSaving(true)
    const { error: err } = await supabase.rpc('acc_post_entry', {
      p: {
        competence_date: competence,
        cash_date: cashDate || null,
        history: history.trim(),
        document: document.trim() || null,
        cost_center_id: costCenter || null,
        notes: notes.trim() || null,
        lines: lines.map((l) => ({
          account_id: l.account_id,
          side: l.side,
          amount: parseFloat(l.amount.replace(',', '.')),
          cost_center_id: costCenter || null,
        })),
      },
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Lançamento Contábil</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Competência *</Label>
              <Input type="date" value={competence} onChange={(e) => setCompetence(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data de caixa</Label>
              <Input type="date" value={cashDate} onChange={(e) => setCashDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Histórico *</Label>
            <Input value={history} onChange={(e) => setHistory(e.target.value)} placeholder="Ex.: Pagamento de aluguel — julho/2026" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Documento</Label>
              <Input value={document} onChange={(e) => setDocument(e.target.value)} placeholder="NF, recibo, boleto..." />
            </div>
            <div className="space-y-1.5">
              <Label>Centro de custo</Label>
              <Select value={costCenter || '__none__'} onValueChange={(v) => setCostCenter(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {costCenters.filter((c) => c.active).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Partidas */}
          <div className="space-y-1.5">
            <Label>Partidas *</Label>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Select value={l.side} onValueChange={(v) => setLine(i, { side: v as AccNature })}>
                    <SelectTrigger className="w-20 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="D">Débito</SelectItem>
                      <SelectItem value="C">Crédito</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={l.account_id} onValueChange={(v) => setLine(i, { account_id: v })}>
                    <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder="Selecionar conta..." /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={l.amount}
                    onChange={(e) => setLine(i, { amount: e.target.value })}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="w-28 shrink-0 text-right"
                  />
                  <Button
                    size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0 text-destructive"
                    disabled={lines.length <= 2}
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => setLines((prev) => [...prev, { account_id: '', side: 'D', amount: '' }])}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Adicionar partida
            </Button>
          </div>

          {/* Totais */}
          <div className={cn('rounded-lg border p-3 text-sm flex gap-6 justify-end', totals.diff === 0 && totals.d > 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200')}>
            <span>Débitos: <span className="font-bold tabular-nums">{formatCurrency(totals.d)}</span></span>
            <span>Créditos: <span className="font-bold tabular-nums">{formatCurrency(totals.c)}</span></span>
            <span>Diferença: <span className={cn('font-bold tabular-nums', totals.diff !== 0 && 'text-destructive')}>{formatCurrency(Math.abs(totals.diff))}</span></span>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || totals.diff !== 0 || totals.d === 0}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Contabilizar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
