import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { compressImage } from '@/lib/imageCompress'
import { Product, Combo } from '@/types/database'
import { formatCurrency, cn } from '@/lib/utils'
import { comboTotal, comboFinal, type ComboWithItems } from '@/lib/combos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Minus, Pencil, Trash2, Package2, Camera, Loader2, Eye, EyeOff, Search, Percent, LayoutGrid, List } from 'lucide-react'

type ViewMode = 'grid' | 'list'

const COMBO_QK = ['combos']

async function uploadComboImage(comboId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const filename = `combo-${comboId}-${Date.now()}.${ext}`
  const compressed = await compressImage(file)
  const { error } = await supabase.storage.from('product-images').upload(filename, compressed, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('product-images').getPublicUrl(filename)
  return data.publicUrl
}

/** Nome editável inline: clique no lápis/texto para editar, Enter/blur salva */
function InlineName({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)

  function commit() {
    setEditing(false)
    const v = val.trim()
    if (v && v !== value) onSave(v)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-full h-7 px-1.5 font-semibold border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      />
    )
  }
  return (
    <button
      type="button"
      title="Clique para renomear"
      onClick={() => { setVal(value); setEditing(true) }}
      className="font-semibold truncate text-left hover:bg-muted/70 rounded px-1 -mx-1 transition-colors w-full"
    >
      {value}
    </button>
  )
}

/** Percentual de desconto editável inline */
function InlinePercent({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')

  function commit() {
    setEditing(false)
    const n = parseFloat(val.replace(',', '.'))
    if (!isNaN(n) && n >= 0 && n <= 100 && n !== value) onSave(n)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        inputMode="decimal"
        className="w-full h-6 px-1 text-sm text-center border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      />
    )
  }
  return (
    <button
      type="button"
      title="Percentual de desconto (clique para editar)"
      onClick={() => { setVal(String(value).replace('.', ',')); setEditing(true) }}
      className="w-full rounded hover:bg-muted/70 transition-colors cursor-text"
    >
      <span className="inline-flex items-center gap-0.5 text-sm font-bold text-amber-700">
        {Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
        <Percent className="w-3 h-3" />
      </span>
    </button>
  )
}

function ToggleChip({ on, labelOn, labelOff, onToggle, colorOn }: {
  on: boolean; labelOn: string; labelOff: string; onToggle: () => void; colorOn: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full transition-colors',
        on ? colorOn : 'bg-muted text-muted-foreground hover:bg-muted/80'
      )}
    >
      {on ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      {on ? labelOn : labelOff}
    </button>
  )
}

// ── Modal de criação/edição: selecionar produtos ────────────────────────────

interface SelLine { product: Product; quantity: number }

function ComboFormModal({ open, combo, onClose, onSaved }: {
  open: boolean
  combo: ComboWithItems | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<SelLine[]>([])
  const [saving, setSaving] = useState(false)

  const { data: products = [] } = useQuery({
    queryKey: ['products-for-combo'],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*').eq('active', true).order('name')
      return (data ?? []) as Product[]
    },
  })

  useEffect(() => {
    if (!open) return
    setSearch('')
    if (combo) {
      setName(combo.name)
      setLines((combo.combo_items ?? []).filter((i) => !!i.products).map((i) => ({ product: i.products as Product, quantity: i.quantity })))
    } else {
      setName('')
      setLines([])
    }
  }, [open, combo])

  const filtered = products.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))

  function add(p: Product) {
    setLines((prev) => {
      const ex = prev.find((l) => l.product.id === p.id)
      if (ex) return prev.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l))
      return [...prev, { product: p, quantity: 1 }]
    })
  }

  function updateQty(id: string, delta: number) {
    setLines((prev) => prev
      .map((l) => (l.product.id === id ? { ...l, quantity: l.quantity + delta } : l))
      .filter((l) => l.quantity > 0))
  }

  const total = lines.reduce((s, l) => s + Number(l.product.price) * l.quantity, 0)

  async function handleSave() {
    const n = name.trim()
    if (!n) { alert('Informe o nome do combo.'); return }
    if (lines.length === 0) { alert('Adicione ao menos um produto ao combo.'); return }
    setSaving(true)
    try {
      let comboId = combo?.id
      if (comboId) {
        const { error } = await supabase.from('combos').update({ name: n }).eq('id', comboId)
        if (error) throw error
        const { error: dErr } = await supabase.from('combo_items').delete().eq('combo_id', comboId)
        if (dErr) throw dErr
      } else {
        const { data, error } = await supabase.from('combos').insert({ name: n }).select('id').single()
        if (error || !data) throw error ?? new Error('Falha ao criar combo.')
        comboId = data.id
      }
      const { error: iErr } = await supabase.from('combo_items').insert(
        lines.map((l) => ({ combo_id: comboId, product_id: l.product.id, quantity: l.quantity }))
      )
      if (iErr) throw iErr
      onSaved()
      onClose()
    } catch (e) {
      alert(`Erro ao salvar combo: ${e instanceof Error ? e.message : e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{combo ? 'Editar Combo' : 'Novo Combo'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 flex-1 min-h-0 flex flex-col">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nome do combo *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Combo Casal" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 min-h-0">
            {/* Catálogo */}
            <div className="flex flex-col min-h-0">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
              </div>
              <div className="overflow-y-auto border rounded-md divide-y max-h-64 sm:max-h-80">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => add(p)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/60 text-left"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-muted-foreground shrink-0">{formatCurrency(p.price)}</span>
                  </button>
                ))}
                {filtered.length === 0 && <p className="text-xs text-muted-foreground p-3">Nenhum produto encontrado.</p>}
              </div>
            </div>

            {/* Selecionados */}
            <div className="flex flex-col min-h-0">
              <p className="text-sm font-medium mb-2">Produtos do combo ({lines.length})</p>
              <div className="overflow-y-auto border rounded-md divide-y max-h-64 sm:max-h-80 flex-1">
                {lines.map((l) => (
                  <div key={l.product.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="flex-1 truncate">{l.product.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatCurrency(Number(l.product.price) * l.quantity)}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQty(l.product.id, -1)}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-5 text-center font-medium">{l.quantity}</span>
                      <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQty(l.product.id, 1)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                {lines.length === 0 && <p className="text-xs text-muted-foreground p-3">Clique num produto ao lado para adicionar.</p>}
              </div>
              <p className="text-sm text-right mt-2">
                Total: <span className="font-bold text-green-600">{formatCurrency(total)}</span>
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : combo ? 'Salvar alterações' : 'Criar combo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Card do combo ───────────────────────────────────────────────────────────

function ComboCard({ combo, onEdit, onDelete, onPatch, onImageUpdated }: {
  combo: ComboWithItems
  onEdit: () => void
  onDelete: () => void
  onPatch: (patch: Partial<Pick<Combo, 'name' | 'discount_percent' | 'active' | 'show_in_menu'>>) => void
  onImageUpdated: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const total = comboTotal(combo)
  const final = comboFinal(combo)

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadComboImage(combo.id, file)
      await supabase.from('combos').update({ image_url: url }).eq('id', combo.id)
      onImageUpdated()
    } catch {
      alert('Erro ao fazer upload da imagem.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Card className="overflow-hidden">
      {/* Foto (clique para trocar) */}
      <div className="relative w-full h-36 bg-muted group cursor-pointer" onClick={() => fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleImageUpload} />
        {combo.image_url ? (
          <img src={combo.image_url} alt={combo.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
            <Package2 className="w-8 h-8" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {uploading ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Camera className="w-6 h-6 text-white" />}
        </div>
      </div>

      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <InlineName value={combo.name} onSave={(v) => onPatch({ name: v })} />
            <p className="text-xs text-muted-foreground mt-0.5">
              {(combo.combo_items ?? []).length} produto{(combo.combo_items ?? []).length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button type="button" onClick={() => onPatch({ active: !combo.active })} title="Ativar/desativar combo">
              <Badge variant={combo.active ? 'default' : 'secondary'} className="text-xs cursor-pointer">
                {combo.active ? 'Ativo' : 'Inativo'}
              </Badge>
            </button>
            <ToggleChip
              on={combo.show_in_menu}
              labelOn="No cardápio"
              labelOff="Oculto"
              colorOn="bg-green-100 text-green-800 hover:bg-green-200"
              onToggle={() => onPatch({ show_in_menu: !combo.show_in_menu })}
            />
          </div>
        </div>

        {/* Produtos do combo */}
        <ul className="text-xs text-muted-foreground space-y-0.5 border-t pt-2">
          {(combo.combo_items ?? []).map((i) => (
            <li key={i.id} className="flex justify-between gap-2">
              <span className="truncate">{i.quantity}x {i.products?.name ?? '—'}</span>
              <span className="shrink-0">{formatCurrency(Number(i.products?.price ?? 0) * i.quantity)}</span>
            </li>
          ))}
        </ul>

        {/* Venda / Desconto / Final */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-md border bg-muted/30 px-1 py-1">
            <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Venda</p>
            <span className="text-sm font-medium tabular-nums">{formatCurrency(total)}</span>
          </div>
          <div className="rounded-md border bg-amber-50 border-amber-200 px-1 py-1">
            <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Desconto</p>
            <InlinePercent value={Number(combo.discount_percent)} onSave={(v) => onPatch({ discount_percent: v })} />
          </div>
          <div className="rounded-md border bg-green-50 border-green-200 px-1 py-1">
            <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Final</p>
            <span className="text-sm font-bold text-green-600 tabular-nums">{formatCurrency(final)}</span>
          </div>
        </div>

        <div className="flex gap-1.5 pt-1">
          <Button size="sm" variant="outline" className="flex-1" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5 mr-1" />
            Editar produtos
          </Button>
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" title="Excluir" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Linha do combo (visualização em lista) ──────────────────────────────────

function ComboRow({ combo, onEdit, onDelete, onPatch }: {
  combo: ComboWithItems
  onEdit: () => void
  onDelete: () => void
  onPatch: (patch: Partial<Pick<Combo, 'name' | 'discount_percent' | 'active' | 'show_in_menu'>>) => void
}) {
  const total = comboTotal(combo)
  const final = comboFinal(combo)
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:shadow-sm transition-shadow">
      <div className="w-11 h-11 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center">
        {combo.image_url
          ? <img src={combo.image_url} alt={combo.name} className="w-full h-full object-cover" />
          : <Package2 className="w-5 h-5 text-muted-foreground/40" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="max-w-56"><InlineName value={combo.name} onSave={(v) => onPatch({ name: v })} /></div>
          <button type="button" onClick={() => onPatch({ active: !combo.active })} title="Ativar/desativar combo">
            <Badge variant={combo.active ? 'default' : 'secondary'} className="text-[10px] cursor-pointer">
              {combo.active ? 'Ativo' : 'Inativo'}
            </Badge>
          </button>
          <ToggleChip
            on={combo.show_in_menu}
            labelOn="No cardápio"
            labelOff="Oculto"
            colorOn="bg-green-100 text-green-800 hover:bg-green-200"
            onToggle={() => onPatch({ show_in_menu: !combo.show_in_menu })}
          />
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {(combo.combo_items ?? []).map((i) => `${i.quantity}x ${i.products?.name}`).join(', ')}
        </p>
      </div>
      {/* Venda / Desconto / Final */}
      <div className="hidden sm:grid grid-cols-3 gap-1.5 text-center shrink-0 w-64">
        <div className="rounded-md border bg-muted/30 px-1 py-0.5">
          <p className="text-[9px] text-muted-foreground leading-none">Venda</p>
          <span className="text-xs font-medium tabular-nums">{formatCurrency(total)}</span>
        </div>
        <div className="rounded-md border bg-amber-50 border-amber-200 px-1 py-0.5">
          <p className="text-[9px] text-muted-foreground leading-none">Desconto</p>
          <InlinePercent value={Number(combo.discount_percent)} onSave={(v) => onPatch({ discount_percent: v })} />
        </div>
        <div className="rounded-md border bg-green-50 border-green-200 px-1 py-0.5">
          <p className="text-[9px] text-muted-foreground leading-none">Final</p>
          <span className="text-xs font-bold text-green-600 tabular-nums">{formatCurrency(final)}</span>
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <Button size="sm" variant="outline" title="Editar produtos" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" title="Excluir" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ── Guia Combos ─────────────────────────────────────────────────────────────

export function CombosTab() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ComboWithItems | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('combos-view') as ViewMode) || 'grid')

  const changeView = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('combos-view', mode)
  }

  const { data: combos = [], isLoading } = useQuery({
    queryKey: COMBO_QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('combos')
        .select('*, combo_items(*, products(*))')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ComboWithItems[]
    },
  })

  const patchMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Combo> }) => {
      const { error } = await supabase.from('combos').update(patch).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: COMBO_QK })
      const prev = queryClient.getQueryData<ComboWithItems[]>(COMBO_QK)
      queryClient.setQueryData<ComboWithItems[]>(COMBO_QK, (old) =>
        (old ?? []).map((c) => (c.id === id ? ({ ...c, ...patch } as ComboWithItems) : c)))
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) queryClient.setQueryData(COMBO_QK, ctx.prev) },
    onSettled: () => queryClient.invalidateQueries({ queryKey: COMBO_QK }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('combos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMBO_QK }),
  })

  function handleDelete(c: ComboWithItems) {
    if (!confirm(`Excluir o combo "${c.name}"? Esta ação não pode ser desfeita.`)) return
    deleteMutation.mutate(c.id)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Combos</h2>
        <div className="flex gap-2">
          <div className="flex rounded-md border overflow-hidden">
            <button
              title="Visualização em grade"
              onClick={() => changeView('grid')}
              className={cn('px-2.5 flex items-center', viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              title="Visualização em lista"
              onClick={() => changeView('list')}
              className={cn('px-2.5 flex items-center border-l', viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true) }}>
            <Plus className="w-4 h-4 mr-1" />
            Combo
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-64 rounded-lg bg-muted animate-pulse" />)}
        </div>
      )}

      {!isLoading && combos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Package2 className="w-10 h-10 opacity-30" />
          <p className="text-sm">Nenhum combo cadastrado.</p>
          <Button size="sm" variant="outline" onClick={() => { setEditing(null); setModalOpen(true) }}>
            <Plus className="w-4 h-4 mr-1" />
            Criar primeiro combo
          </Button>
        </div>
      )}

      {!isLoading && combos.length > 0 && viewMode === 'list' && (
        <div className="space-y-2">
          {combos.map((c) => (
            <ComboRow
              key={c.id}
              combo={c}
              onEdit={() => { setEditing(c); setModalOpen(true) }}
              onDelete={() => handleDelete(c)}
              onPatch={(patch) => patchMutation.mutate({ id: c.id, patch })}
            />
          ))}
        </div>
      )}

      {!isLoading && combos.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {combos.map((c) => (
            <ComboCard
              key={c.id}
              combo={c}
              onEdit={() => { setEditing(c); setModalOpen(true) }}
              onDelete={() => handleDelete(c)}
              onPatch={(patch) => patchMutation.mutate({ id: c.id, patch })}
              onImageUpdated={() => queryClient.invalidateQueries({ queryKey: COMBO_QK })}
            />
          ))}
        </div>
      )}

      <ComboFormModal
        open={modalOpen}
        combo={editing}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSaved={() => queryClient.invalidateQueries({ queryKey: COMBO_QK })}
      />
    </div>
  )
}
