import { useMemo, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, ListTree, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KIND_LABELS, KIND_COLORS, sortAccounts } from './accUtils'
import type { AccAccount, AccCostCenter, AccKind, AccNature } from '@/types/database'

const QK = ['acc-accounts']

interface FormState {
  code: string
  name: string
  kind: AccKind
  nature: AccNature
  parent_id: string
  allows_entries: boolean
  default_cost_center_id: string
  notes: string
}

const EMPTY_FORM: FormState = {
  code: '', name: '', kind: 'despesa', nature: 'D', parent_id: '',
  allows_entries: true, default_cost_center_id: '', notes: '',
}

export function PlanoContasTab() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AccAccount | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase.from('acc_accounts').select('*')
      if (error) throw error
      return sortAccounts(data as AccAccount[])
    },
  })

  const { data: costCenters = [] } = useQuery({
    queryKey: ['acc-cost-centers'],
    queryFn: async () => {
      const { data } = await supabase.from('acc_cost_centers').select('*').eq('active', true).order('name')
      return (data ?? []) as AccCostCenter[]
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QK })

  useEffect(() => {
    if (!modalOpen) return
    if (editing) {
      setForm({
        code: editing.code,
        name: editing.name,
        kind: editing.kind,
        nature: editing.nature,
        parent_id: editing.parent_id ?? '',
        allows_entries: editing.allows_entries,
        default_cost_center_id: editing.default_cost_center_id ?? '',
        notes: editing.notes ?? '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [modalOpen, editing])

  // Quando escolhe a conta-pai numa conta nova, herda tipo/natureza e sugere o código
  function handleParentChange(parentId: string) {
    const parent = accounts.find((a) => a.id === parentId)
    setForm((f) => {
      const next = { ...f, parent_id: parentId }
      if (parent) {
        next.kind = parent.kind
        next.nature = parent.nature
        if (!editing) {
          const siblings = accounts.filter((a) => a.parent_id === parentId)
          const lastSeg = siblings
            .map((s) => Number(s.code.split('.').pop()))
            .filter((n) => !isNaN(n))
            .reduce((m, n) => Math.max(m, n), 0)
          next.code = `${parent.code}.${lastSeg + 1}`
        }
      }
      return next
    })
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim()) { alert('Informe código e nome.'); return }
    setSaving(true)
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      kind: form.kind,
      nature: form.nature,
      parent_id: form.parent_id || null,
      level: form.code.trim().split('.').length,
      allows_entries: form.allows_entries,
      default_cost_center_id: form.default_cost_center_id || null,
      notes: form.notes.trim() || null,
    }
    const { error } = editing
      ? await supabase.from('acc_accounts').update(payload).eq('id', editing.id)
      : await supabase.from('acc_accounts').insert(payload)
    setSaving(false)
    if (error) { alert(`Erro ao salvar: ${error.message}`); return }
    setModalOpen(false)
    setEditing(null)
    invalidate()
  }

  async function handleDelete(a: AccAccount) {
    // Bloqueia exclusão de conta com lançamentos ou com filhas
    const { count: lines } = await supabase.from('acc_entry_lines').select('id', { count: 'exact', head: true }).eq('account_id', a.id)
    if ((lines ?? 0) > 0) {
      alert(`A conta ${a.code} — ${a.name} possui ${lines} lançamento(s) vinculados e não pode ser excluída. Inative-a.`)
      return
    }
    const hasChildren = accounts.some((c) => c.parent_id === a.id)
    if (hasChildren) { alert('Esta conta possui contas filhas. Exclua ou mova as filhas antes.'); return }
    if (!confirm(`Excluir a conta ${a.code} — ${a.name}?`)) return
    const { error } = await supabase.from('acc_accounts').delete().eq('id', a.id)
    if (error) { alert(`Erro: ${error.message}`); return }
    invalidate()
  }

  async function toggleActive(a: AccAccount) {
    await supabase.from('acc_accounts').update({ active: !a.active }).eq('id', a.id)
    invalidate()
  }

  // Visibilidade: esconde descendentes de nós recolhidos; busca ignora recolhimento
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q) return accounts.filter((a) => a.code.startsWith(search.trim()) || a.name.toLowerCase().includes(q))
    const byId = new Map(accounts.map((a) => [a.id, a]))
    return accounts.filter((a) => {
      let p = a.parent_id ? byId.get(a.parent_id) : undefined
      while (p) {
        if (collapsed.has(p.id)) return false
        p = p.parent_id ? byId.get(p.parent_id) : undefined
      }
      return true
    })
  }, [accounts, collapsed, search])

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const synthetic = accounts.filter((a) => !a.allows_entries)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">Plano de Contas <span className="text-sm text-muted-foreground font-normal">({accounts.length} contas)</span></h2>
        <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true) }}>
          <Plus className="w-4 h-4 mr-1" />
          Nova Conta
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por código ou nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading && <div className="h-64 rounded-lg bg-muted animate-pulse" />}

      {!isLoading && (
        <div className="border rounded-lg divide-y overflow-hidden">
          {visible.map((a) => {
            const hasChildren = accounts.some((c) => c.parent_id === a.id)
            return (
              <div
                key={a.id}
                className={cn('flex items-center gap-2 px-3 py-2 hover:bg-muted/40 text-sm', !a.allows_entries && 'bg-muted/30')}
                style={{ paddingLeft: `${(a.level - 1) * 22 + 12}px` }}
              >
                {hasChildren ? (
                  <button onClick={() => toggleCollapse(a.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
                    {collapsed.has(a.id) ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                ) : <span className="w-4 shrink-0" />}
                <span className="font-mono text-xs text-muted-foreground shrink-0 w-16">{a.code}</span>
                <span className={cn('flex-1 truncate', !a.allows_entries && 'font-semibold', !a.active && 'line-through text-muted-foreground')}>{a.name}</span>
                {a.level === 1 && (
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', KIND_COLORS[a.kind])}>{KIND_LABELS[a.kind]}</span>
                )}
                <Badge variant="outline" className="text-[10px] shrink-0" title={a.nature === 'D' ? 'Natureza devedora' : 'Natureza credora'}>{a.nature}</Badge>
                {!a.active && <Badge variant="secondary" className="text-[10px]">Inativa</Badge>}
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Editar" onClick={() => { setEditing(a); setModalOpen(true) }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => toggleActive(a)}>
                    {a.active ? 'Inativar' : 'Reativar'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="Excluir" onClick={() => handleDelete(a)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
          {visible.length === 0 && (
            <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
              <ListTree className="w-10 h-10 opacity-30" />
              <p className="text-sm">Nenhuma conta encontrada.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal criar/editar */}
      <Dialog open={modalOpen} onOpenChange={(v) => { if (!v) { setModalOpen(false); setEditing(null) } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar conta ${editing.code}` : 'Nova Conta'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Conta-pai</Label>
              <Select value={form.parent_id} onValueChange={handleParentChange}>
                <SelectTrigger><SelectValue placeholder="(sem pai — grupo de nível 1)" /></SelectTrigger>
                <SelectContent>
                  {synthetic.filter((s) => s.id !== editing?.id).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Código *</Label>
                <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="6.4.9" />
              </div>
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nome da conta" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as AccKind }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_LABELS) as AccKind[]).map((k) => (
                      <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Natureza *</Label>
                <Select value={form.nature} onValueChange={(v) => setForm((f) => ({ ...f, nature: v as AccNature }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="D">Devedora</SelectItem>
                    <SelectItem value="C">Credora</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Aceita lançamento direto</Label>
                <Select value={form.allows_entries ? 'sim' : 'nao'} onValueChange={(v) => setForm((f) => ({ ...f, allows_entries: v === 'sim' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim (analítica)</SelectItem>
                    <SelectItem value="nao">Não (sintética/grupo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Centro de custo padrão</Label>
                <Select value={form.default_cost_center_id || '__none__'} onValueChange={(v) => setForm((f) => ({ ...f, default_cost_center_id: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {costCenters.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setModalOpen(false); setEditing(null) }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
