import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Check, X, Target } from 'lucide-react'
import type { AccCostCenter } from '@/types/database'

const QK = ['acc-cost-centers']

export function CentrosCustoTab() {
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const { data: centers = [], isLoading } = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase.from('acc_cost_centers').select('*').order('name')
      if (error) throw error
      return data as AccCostCenter[]
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QK })

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('acc_cost_centers').insert({ name })
      if (error) throw error
    },
    onSuccess: () => { setNewName(''); invalidate() },
    onError: (e) => alert(`Erro: ${e.message}`),
  })

  const patchMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AccCostCenter> }) => {
      const { error } = await supabase.from('acc_cost_centers').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { setEditingId(null); invalidate() },
    onError: (e) => alert(`Erro: ${e.message}`),
  })

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Centros de Custo</h2>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Novo centro de custo..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) addMutation.mutate(newName.trim()) }}
        />
        <Button onClick={() => newName.trim() && addMutation.mutate(newName.trim())} disabled={!newName.trim() || addMutation.isPending}>
          <Plus className="w-4 h-4 mr-1" />
          Adicionar
        </Button>
      </div>

      {isLoading && <div className="h-40 rounded-lg bg-muted animate-pulse" />}

      {!isLoading && centers.length === 0 && (
        <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
          <Target className="w-10 h-10 opacity-30" />
          <p className="text-sm">Nenhum centro de custo cadastrado.</p>
        </div>
      )}

      <div className="space-y-2">
        {centers.map((c) => (
          <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card">
            {editingId === c.id ? (
              <>
                <Input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && editName.trim()) patchMutation.mutate({ id: c.id, patch: { name: editName.trim() } })
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="h-8"
                />
                <Button size="sm" variant="outline" onClick={() => editName.trim() && patchMutation.mutate({ id: c.id, patch: { name: editName.trim() } })}>
                  <Check className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </>
            ) : (
              <>
                <span className={`flex-1 font-medium ${!c.active ? 'text-muted-foreground line-through' : ''}`}>{c.name}</span>
                {!c.active && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                <Button size="sm" variant="outline" title="Renomear" onClick={() => { setEditingId(c.id); setEditName(c.name) }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => patchMutation.mutate({ id: c.id, patch: { active: !c.active } })}
                >
                  {c.active ? 'Inativar' : 'Reativar'}
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
