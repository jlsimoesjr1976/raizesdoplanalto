import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Ingredient } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import InsumoFormModal from './InsumoFormModal'
import { ImportXlsxModal } from './ImportXlsxModal'
import { insumosImportConfig } from '@/lib/importConfigs'
import {
  Plus, Search, Pencil, Trash2, AlertTriangle, Package, TrendingDown, FileSpreadsheet
} from 'lucide-react'

function formatBRL(v: number, decimals = 2) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

async function fetchIngredients(): Promise<Ingredient[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
    .order('name')
  if (error) throw error
  return (data ?? []) as Ingredient[]
}

export default function InsumosManagement() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const { data: ingredients = [], isLoading } = useQuery({
    queryKey: ['ingredients'],
    queryFn: fetchIngredients,
  })

  const saveMutation = useMutation({
    mutationFn: async (payload: { id?: string; data: Omit<Ingredient, 'id' | 'created_at' | 'cost_per_unit'> }) => {
      const { id, data } = payload
      const costPerUnit = data.quantity > 0 ? data.cost / data.quantity : 0
      const row = { ...data, cost_per_unit: costPerUnit }

      if (id) {
        const { error } = await supabase.from('ingredients').update(row).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('ingredients').insert(row)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ingredients'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ingredients').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ingredients'] }),
  })

  async function handleSave(data: Omit<Ingredient, 'id' | 'created_at' | 'cost_per_unit'>) {
    await saveMutation.mutateAsync({ id: editing?.id, data })
  }

  function openNew() { setEditing(null); setModalOpen(true) }
  function openEdit(i: Ingredient) { setEditing(i); setModalOpen(true) }

  async function handleDelete(i: Ingredient) {
    if (!confirm(`Excluir o insumo "${i.name}"? Esta ação não pode ser desfeita.`)) return
    await deleteMutation.mutateAsync(i.id)
  }

  const filtered = ingredients.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  const lowStock = ingredients.filter(i => i.quantity <= i.min_quantity && i.min_quantity > 0)
  const totalValue = ingredients.reduce((s, i) => s + i.cost, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Insumos</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gerencie os ingredientes e insumos utilizados na ficha técnica dos produtos
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Importar
          </Button>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Insumo
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Package className="w-4 h-4" /> Total de Insumos
          </div>
          <p className="text-2xl font-bold">{ingredients.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <TrendingDown className="w-4 h-4" /> Valor em Estoque
          </div>
          <p className="text-2xl font-bold text-primary">{formatBRL(totalValue)}</p>
        </div>
        {lowStock.length > 0 && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 text-destructive text-sm mb-1">
              <AlertTriangle className="w-4 h-4" /> Estoque Crítico
            </div>
            <p className="text-2xl font-bold text-destructive">{lowStock.length}</p>
          </div>
        )}
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar insumo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum insumo encontrado</p>
          {search ? <p className="text-sm">Tente outra busca</p> : <p className="text-sm">Clique em "Novo Insumo" para começar</p>}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          {/* Cabeçalho — desktop */}
          <div className="hidden sm:grid grid-cols-[2fr_80px_140px_140px_140px_88px] gap-4 px-4 py-3 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span>Insumo</span>
            <span>Unidade</span>
            <span className="text-right">Qtd. em Estoque</span>
            <span className="text-right">Valor de Custo</span>
            <span className="text-right">Custo / Unidade</span>
            <span />
          </div>

          <div className="divide-y">
            {filtered.map(i => {
              const isLow = i.min_quantity > 0 && i.quantity <= i.min_quantity
              return (
                <div
                  key={i.id}
                  className="grid sm:grid-cols-[2fr_80px_140px_140px_140px_88px] grid-cols-1 gap-2 sm:gap-4 px-4 py-3 items-center hover:bg-muted/20 transition-colors"
                >
                  {/* Nome */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{i.name}</p>
                      {isLow && (
                        <span className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Estoque baixo
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Unidade */}
                  <div>
                    <Badge variant="outline" className="text-xs font-mono">{i.unit}</Badge>
                  </div>

                  {/* Quantidade */}
                  <div className="sm:text-right">
                    <span className={`font-semibold text-sm ${isLow ? 'text-destructive' : ''}`}>
                      {i.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {i.unit}
                    </span>
                    {i.min_quantity > 0 && (
                      <p className="text-xs text-muted-foreground">
                        mín: {i.min_quantity} {i.unit}
                      </p>
                    )}
                  </div>

                  {/* Valor de Custo (lote) */}
                  <div className="sm:text-right">
                    <span className="text-sm font-medium">{formatBRL(i.cost)}</span>
                    <p className="text-xs text-muted-foreground sm:hidden">valor do lote</p>
                  </div>

                  {/* Custo por Unidade */}
                  <div className="sm:text-right">
                    <span className="text-sm font-semibold text-primary">
                      {formatBRL(i.cost_per_unit, 4)} / {i.unit}
                    </span>
                    <p className="text-xs text-muted-foreground sm:hidden">custo por unidade</p>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1 sm:justify-end">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(i)} className="h-8 w-8">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(i)}
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <InsumoFormModal
        open={modalOpen}
        ingredient={editing}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />

      <ImportXlsxModal
        open={importOpen}
        config={insumosImportConfig}
        onClose={() => setImportOpen(false)}
        onImported={() => qc.invalidateQueries({ queryKey: ['ingredients'] })}
      />
    </div>
  )
}
