import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Category } from '@/types/database'
import { CategoriaFormModal } from './CategoriaFormModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Tag, Eye, EyeOff, LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'

type ViewMode = 'grid' | 'list'

function MenuToggle({ visible, onToggle, small }: { visible: boolean; onToggle: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      title={visible ? 'Visível no cardápio do cliente (clique para ocultar)' : 'Oculta no cardápio do cliente (clique para exibir)'}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full transition-colors',
        small ? 'text-[10px]' : 'text-xs',
        visible ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-muted text-muted-foreground hover:bg-muted/80'
      )}
    >
      {visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      {visible ? 'No cardápio' : 'Oculta'}
    </button>
  )
}

export function CategoriasTab() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('categorias-view') as ViewMode) || 'grid')

  const changeView = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('categorias-view', mode)
  }

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

  const menuMutation = useMutation({
    mutationFn: async ({ id, show }: { id: string; show: boolean }) => {
      const { error } = await supabase.from('categories').update({ show_in_menu: show }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, show }) => {
      await queryClient.cancelQueries({ queryKey: ['categories'] })
      const prev = queryClient.getQueryData<Category[]>(['categories'])
      queryClient.setQueryData<Category[]>(['categories'], (old) =>
        (old ?? []).map((c) => (c.id === id ? { ...c, show_in_menu: show } : c)))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['categories'], ctx.prev)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
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
          <Button size="sm" onClick={handleNew}>
            <Plus className="w-4 h-4 mr-1" />
            Nova Categoria
          </Button>
        </div>
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

      {!isLoading && categories.length > 0 && viewMode === 'list' && (
        <div className="space-y-2">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:shadow-sm transition-shadow">
              <div className="w-9 h-9 rounded-md bg-muted shrink-0 flex items-center justify-center">
                <Tag className="w-4 h-4 text-muted-foreground/50" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{cat.name}</span>
                  {!cat.active && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                  <MenuToggle small visible={cat.show_in_menu} onToggle={() => menuMutation.mutate({ id: cat.id, show: !cat.show_in_menu })} />
                </div>
                {cat.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{cat.description}</p>}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">Ordem: {cat.sort_order}</span>
              <div className="flex gap-1.5 shrink-0">
                <Button size="sm" variant="outline" title="Editar" onClick={() => handleEdit(cat)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" title="Excluir" onClick={() => handleDelete(cat)} disabled={deleteMutation.isPending}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && categories.length > 0 && viewMode === 'grid' && (
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
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={cat.active ? 'default' : 'secondary'} className="text-xs">
                      {cat.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <MenuToggle visible={cat.show_in_menu} onToggle={() => menuMutation.mutate({ id: cat.id, show: !cat.show_in_menu })} />
                  </div>
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
