import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Ingredient } from '@/types/database'

const UNITS = [
  { value: 'kg', label: 'Quilograma (kg)' },
  { value: 'g', label: 'Grama (g)' },
  { value: 'L', label: 'Litro (L)' },
  { value: 'ml', label: 'Mililitro (ml)' },
  { value: 'un', label: 'Unidade (un)' },
  { value: 'dz', label: 'Dúzia (dz)' },
  { value: 'cx', label: 'Caixa (cx)' },
  { value: 'pct', label: 'Pacote (pct)' },
]

interface Props {
  open: boolean
  ingredient: Ingredient | null
  onClose: () => void
  onSave: (data: Omit<Ingredient, 'id' | 'created_at' | 'cost_per_unit'>) => Promise<void>
}

const EMPTY = { name: '', unit: 'kg', quantity: '', min_quantity: '', cost: '' }

export default function InsumoFormModal({ open, ingredient, onClose, onSave }: Props) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (ingredient) {
      setForm({
        name: ingredient.name,
        unit: ingredient.unit,
        quantity: String(ingredient.quantity),
        min_quantity: String(ingredient.min_quantity),
        cost: String(ingredient.cost),
      })
    } else {
      setForm(EMPTY)
    }
    setError('')
  }, [ingredient, open])

  const qty = parseFloat(form.quantity) || 0
  const cost = parseFloat(form.cost) || 0
  const costPerUnit = qty > 0 ? cost / qty : 0

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Informe o nome do insumo.'); return }
    if (qty <= 0) { setError('Quantidade deve ser maior que zero.'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({
        name: form.name.trim(),
        unit: form.unit,
        quantity: qty,
        min_quantity: parseFloat(form.min_quantity) || 0,
        cost,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ingredient ? 'Editar Insumo' : 'Novo Insumo'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Insumo *</Label>
            <Input
              id="name"
              placeholder="Ex: Farinha de trigo"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              autoFocus
            />
          </div>

          {/* Unidade */}
          <div className="space-y-1.5">
            <Label>Unidade de Medida *</Label>
            <Select value={form.unit} onValueChange={v => set('unit', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map(u => (
                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantidade + Estoque mínimo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quantity">Qtd. em Estoque *</Label>
              <div className="relative">
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="0"
                  value={form.quantity}
                  onChange={e => set('quantity', e.target.value)}
                  className="pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {form.unit}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="min_quantity">Estoque Mínimo</Label>
              <div className="relative">
                <Input
                  id="min_quantity"
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="0"
                  value={form.min_quantity}
                  onChange={e => set('min_quantity', e.target.value)}
                  className="pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {form.unit}
                </span>
              </div>
            </div>
          </div>

          {/* Valor de Custo + Custo por Unidade (calculado) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cost">Valor de Custo (lote)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                <Input
                  id="cost"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  value={form.cost}
                  onChange={e => set('cost', e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Custo por {form.unit}</Label>
              <div className="flex items-center h-10 px-3 rounded-md border bg-muted/40 text-sm font-medium text-primary">
                {costPerUnit > 0
                  ? `R$ ${costPerUnit.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
                  : '—'}
              </div>
            </div>
          </div>

          {costPerUnit > 0 && (
            <p className="text-xs text-muted-foreground bg-accent/40 rounded-md px-3 py-2">
              Cada <strong>1 {form.unit}</strong> custa <strong>R$ {costPerUnit.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</strong>
              {' '}— usado automaticamente na ficha técnica dos produtos.
            </p>
          )}

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando...' : ingredient ? 'Salvar Alterações' : 'Criar Insumo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
