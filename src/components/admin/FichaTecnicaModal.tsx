import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Product, Ingredient } from '@/types/database'
import { formatCurrency } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Trash2, ClipboardList, Package } from 'lucide-react'

interface ProductIngredient {
  product_id: string
  ingredient_id: string
  quantity: number
  ingredients: Ingredient
}

interface Props {
  open: boolean
  product: Product | null
  onClose: () => void
}

export function FichaTecnicaModal({ open, product, onClose }: Props) {
  const queryClient = useQueryClient()
  const [addIngredientId, setAddIngredientId] = useState<string>('')
  const [addQty, setAddQty] = useState<string>('1')
  const [editQtys, setEditQtys] = useState<Record<string, string>>({})

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ['product_ingredients', product?.id],
    enabled: open && !!product,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_ingredients')
        .select('*, ingredients(*)')
        .eq('product_id', product!.id)
      if (error) throw error
      return data as ProductIngredient[]
    },
  })

  const { data: allIngredients = [] } = useQuery({
    queryKey: ['ingredients'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ingredients')
        .select('*')
        .order('name')
      if (error) throw error
      return data as Ingredient[]
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['product_ingredients', product?.id] })
  }

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('product_ingredients').insert({
        product_id: product!.id,
        ingredient_id: addIngredientId,
        quantity: Number(addQty),
      })
      if (error) throw error
    },
    onSuccess: () => {
      setAddIngredientId('')
      setAddQty('1')
      invalidate()
    },
  })

  const removeMutation = useMutation({
    mutationFn: async ({ ingredient_id }: { ingredient_id: string }) => {
      const { error } = await supabase
        .from('product_ingredients')
        .delete()
        .eq('product_id', product!.id)
        .eq('ingredient_id', ingredient_id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateQtyMutation = useMutation({
    mutationFn: async ({ ingredient_id, quantity }: { ingredient_id: string; quantity: number }) => {
      const { error } = await supabase
        .from('product_ingredients')
        .update({ quantity })
        .eq('product_id', product!.id)
        .eq('ingredient_id', ingredient_id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const totalCost = items.reduce(
    (acc, item) => acc + item.quantity * item.ingredients.cost_per_unit,
    0
  )

  const availableIngredients = allIngredients.filter(
    (ing) => !items.some((i) => i.ingredient_id === ing.id)
  )

  const handleQtyBlur = (ingredient_id: string) => {
    const val = editQtys[ingredient_id]
    if (val === undefined) return
    const qty = Number(val)
    if (qty > 0) {
      updateQtyMutation.mutate({ ingredient_id, quantity: qty })
    }
    setEditQtys((prev) => {
      const next = { ...prev }
      delete next[ingredient_id]
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            Ficha Técnica — {product?.name}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          {loadingItems && (
            <div className="space-y-2 py-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 rounded bg-muted animate-pulse" />
              ))}
            </div>
          )}

          {!loadingItems && items.length === 0 && (
            <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
              <Package className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nenhum insumo vinculado.</p>
            </div>
          )}

          {!loadingItems && items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Insumo</th>
                    <th className="pb-2 pr-3 font-medium">Unidade</th>
                    <th className="pb-2 pr-3 font-medium">Qtd</th>
                    <th className="pb-2 pr-3 font-medium">Custo Unit.</th>
                    <th className="pb-2 pr-3 font-medium">Custo Total</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const ing = item.ingredients
                    const displayQty =
                      editQtys[item.ingredient_id] !== undefined
                        ? editQtys[item.ingredient_id]
                        : String(item.quantity)
                    return (
                      <tr key={item.ingredient_id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{ing.name}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{ing.unit}</td>
                        <td className="py-2 pr-3">
                          <Input
                            className="w-20 h-7 text-sm"
                            type="number"
                            min={0.001}
                            step="any"
                            value={displayQty}
                            onChange={(e) =>
                              setEditQtys((prev) => ({
                                ...prev,
                                [item.ingredient_id]: e.target.value,
                              }))
                            }
                            onBlur={() => handleQtyBlur(item.ingredient_id)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {formatCurrency(ing.cost_per_unit)}
                        </td>
                        <td className="py-2 pr-3 font-semibold">
                          {formatCurrency(item.quantity * ing.cost_per_unit)}
                        </td>
                        <td className="py-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => removeMutation.mutate({ ingredient_id: item.ingredient_id })}
                          >
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
        </ScrollArea>

        {items.length > 0 && (
          <div className="flex justify-end">
            <p className="text-sm font-semibold">
              Custo Total da Ficha:{' '}
              <span className="text-primary">{formatCurrency(totalCost)}</span>
            </p>
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <p className="text-sm font-medium">Adicionar Insumo</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={addIngredientId} onValueChange={setAddIngredientId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecionar insumo..." />
              </SelectTrigger>
              <SelectContent>
                {availableIngredients.length === 0 && (
                  <SelectItem value="__none__" disabled>
                    Todos os insumos já vinculados
                  </SelectItem>
                )}
                {availableIngredients.map((ing) => (
                  <SelectItem key={ing.id} value={ing.id}>
                    {ing.name} ({ing.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              className="w-28"
              type="number"
              min={0.001}
              step="any"
              placeholder="Qtd"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
            />

            <Button
              onClick={() => addMutation.mutate()}
              disabled={!addIngredientId || !addQty || addMutation.isPending}
            >
              <Plus className="w-4 h-4 mr-1" />
              Adicionar
            </Button>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
