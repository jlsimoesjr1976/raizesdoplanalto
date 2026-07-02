import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Category } from '@/types/database'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'

interface Props {
  open: boolean
  category: Category | null
  onClose: () => void
  onSave: () => void
}

interface FormState {
  name: string
  description: string
  sort_order: number
  active: boolean
}

const defaultForm: FormState = {
  name: '',
  description: '',
  sort_order: 0,
  active: true,
}

export function CategoriaFormModal({ open, category, onClose, onSave }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(defaultForm)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      if (category) {
        setForm({
          name: category.name,
          description: category.description ?? '',
          sort_order: category.sort_order,
          active: category.active,
        })
      } else {
        setForm(defaultForm)
      }
    }
  }, [open, category])

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        sort_order: form.sort_order,
        active: form.active,
      }
      if (category) {
        const { error } = await supabase
          .from('categories')
          .update(payload)
          .eq('id', category.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('categories').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      onSave()
      onClose()
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('O nome é obrigatório.')
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle>{category ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="cat-name">Nome *</Label>
            <Input
              id="cat-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Entradas"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cat-desc">Descrição</Label>
            <Textarea
              id="cat-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descrição opcional"
              rows={3}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cat-order">Ordem de Exibição</Label>
            <Input
              id="cat-order"
              type="number"
              min={0}
              value={form.sort_order}
              onChange={(e) =>
                setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))
              }
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="cat-active"
              checked={form.active}
              onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
            />
            <Label htmlFor="cat-active">Ativo</Label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
