import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Category } from '@/types/database'
import { CategoriaFormModal } from './CategoriaFormModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Tag } from 'lucide-react'

export function CategoriasTab() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data as Category[]
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  })

  const handleDelete = (cat: Category) => {
    if (!confirm(`Excluir a categoria "${cat.name}"? Esta ação não pode ser desfeita.`)) return
    deleteMutation.mutate(cat.id)
  }

  const handleEdit = (cat: Category) => {
    setEditing(cat)
    setModalOpen(true)
  }

  const handleNew = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const handleClose = () => {
    setModalOpen(false)
    setEditing(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Categorias</h2>
        <Button size="sm" onClick={handleNew}>
          <Plus className="w-4 h-4 mr-1" />
          Nova Categoria
        </Button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && categories.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Tag className="w-10 h-10 opacity-30" />
          <p className="text-sm">Nenhuma categoria cadastrada.</p>
          <Button size="sm" variant="outline" onClick={handleNew}>
            <Plus className="w-4 h-4 mr-1" />
            Criar primeira categoria
          </Button>
        </div>
      )}

      {!isLoading && categories.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {categories.map((cat) => (
            <Card key={cat.id} className="overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{cat.name}</p>
                    {cat.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {cat.description}
                      </p>
                    )}
                  </div>
                  <Badge variant={cat.active ? 'default' : 'secondary'} className="shrink-0 text-xs">
                    {cat.active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground">Ordem: {cat.sort_order}</p>

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleEdit(cat)}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(cat)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CategoriaFormModal
        open={modalOpen}
        category={editing}
        onClose={handleClose}
        onSave={() => {}}
      />
    </div>
  )
}
