import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Minus, Plus, Search, ShoppingCart, Package2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { formatCurrency } from '@/lib/utils'
import type { Product, Category } from '@/types/database'
import { comboAvailable, comboFinal, comboTotal, expandCombo, type ComboWithItems } from '@/lib/combos'

interface CartItem {
  product: Product
  quantity: number
  notes: string
  /** Presente quando o item veio da expansão de um combo */
  comboKey?: string
}

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (items: CartItem[]) => Promise<void>
}

export function AdicionarItemModal({ open, onClose, onConfirm }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [combos, setCombos] = useState<ComboWithItems[]>([])
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setCart([])
      setSearch('')
      loadData()
    }
  }, [open])

  async function loadData() {
    const [{ data: cats }, { data: prods }, { data: cbs }] = await Promise.all([
      supabase.from('categories').select('*').eq('active', true).order('sort_order'),
      supabase.from('products').select('*').eq('active', true).gte('stock_quantity', 1).order('name'),
      supabase.from('combos').select('*, combo_items(*, products(*))').eq('active', true).order('name'),
    ])
    setCategories(cats ?? [])
    setProducts(prods ?? [])
    setCombos(((cbs ?? []) as ComboWithItems[]).filter(comboAvailable))
  }

  const filtered = products.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = activeCategory === 'all' || p.category_id === activeCategory
    return matchSearch && matchCat
  })

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id && !i.comboKey)
      if (existing) return prev.map((i) => (i.product.id === product.id && !i.comboKey) ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product, quantity: 1, notes: '' }]
    })
  }

  function addCombo(combo: ComboWithItems) {
    // Expande o combo: cada produto entra com o preço já descontado e vai à sua fila de preparo
    const expanded = expandCombo(combo, 1)
    setCart((prev) => {
      const next = [...prev]
      for (const e of expanded) {
        const idx = next.findIndex((i) => i.comboKey === combo.id && i.product.id === e.product.id)
        if (idx >= 0) next[idx] = { ...next[idx], quantity: next[idx].quantity + e.quantity }
        else next.push({
          product: { ...e.product, name: e.display_name, price: e.unit_price },
          quantity: e.quantity,
          notes: '',
          comboKey: combo.id,
        })
      }
      return next
    })
  }

  function updateQty(index: number, delta: number) {
    setCart((prev) =>
      prev
        .map((i, idx) => idx === index ? { ...i, quantity: i.quantity + delta } : i)
        .filter((i) => i.quantity > 0)
    )
  }

  function updateNotes(index: number, notes: string) {
    setCart((prev) => prev.map((i, idx) => idx === index ? { ...i, notes } : i))
  }

  const cartTotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0)

  async function handleConfirm() {
    if (cart.length === 0) return
    setLoading(true)
    await onConfirm(cart)
    setLoading(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-0 sm:px-6 sm:pt-6">
          <DialogTitle>Adicionar Itens ao Pedido</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row flex-1 min-h-0 gap-0">
          {/* Catálogo */}
          <div className="flex-1 flex flex-col min-w-0 px-4 pb-4 sm:px-6">
            <div className="relative my-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar item..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Tabs value={activeCategory} onValueChange={setActiveCategory} className="flex-1 flex flex-col min-h-0">
              <TabsList className="flex-wrap h-auto gap-1 mb-3 justify-start bg-transparent px-0">
                <TabsTrigger value="all" className="text-xs h-7">Todos</TabsTrigger>
                {combos.length > 0 && (
                  <TabsTrigger value="combos" className="text-xs h-7 gap-1">
                    <Package2 className="w-3 h-3" />
                    Combos
                  </TabsTrigger>
                )}
                {categories.map((c) => (
                  <TabsTrigger key={c.id} value={c.id} className="text-xs h-7">{c.name}</TabsTrigger>
                ))}
              </TabsList>
              <div className="overflow-y-auto flex-1 pr-1">
                {categories.map((c) => (
                  <TabsContent key={c.id} value={c.id} className="mt-0">
                    <ProductGrid products={filtered} onAdd={addToCart} cart={cart} />
                  </TabsContent>
                ))}
                <TabsContent value="all" className="mt-0">
                  <ProductGrid products={filtered} onAdd={addToCart} cart={cart} />
                </TabsContent>
                <TabsContent value="combos" className="mt-0">
                  <div className="grid grid-cols-2 gap-2">
                    {combos.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => addCombo(c)}
                        className="text-left p-3 rounded-lg border bg-background hover:border-primary hover:bg-primary/5 transition-colors"
                      >
                        <p className="text-xs font-medium leading-tight line-clamp-2">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                          {(c.combo_items ?? []).map((i) => `${i.quantity}x ${i.products?.name}`).join(', ')}
                        </p>
                        <div className="flex items-baseline gap-1.5 mt-1">
                          <p className="text-sm font-bold text-primary">{formatCurrency(comboFinal(c))}</p>
                          {Number(c.discount_percent) > 0 && (
                            <p className="text-[10px] text-muted-foreground line-through">{formatCurrency(comboTotal(c))}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>

          {/* Carrinho */}
          <div className="w-full sm:w-64 border-t sm:border-t-0 sm:border-l flex flex-col bg-muted/30">
            <div className="px-4 py-3 border-b">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <ShoppingCart className="w-4 h-4" />
                Pedido
                {cart.length > 0 && (
                  <Badge variant="secondary" className="ml-auto">{cart.reduce((s,i)=>s+i.quantity,0)}</Badge>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {cart.length === 0 && (
                <p className="text-xs text-muted-foreground text-center mt-8">Nenhum item adicionado</p>
              )}
              {cart.map((item, index) => (
                <div key={`${item.comboKey ?? ''}-${item.product.id}`} className="space-y-1">
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-xs font-medium leading-tight flex-1">{item.product.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatCurrency(item.product.price)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(index, -1)} className="w-6 h-6 rounded border flex items-center justify-center hover:bg-muted">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                    <button onClick={() => updateQty(index, 1)} className="w-6 h-6 rounded border flex items-center justify-center hover:bg-muted">
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="ml-auto text-xs font-medium">{formatCurrency(item.product.price * item.quantity)}</span>
                  </div>
                  <Input
                    placeholder="Obs. (sem cebola...)"
                    value={item.notes}
                    onChange={(e) => updateNotes(index, e.target.value)}
                    className="h-6 text-xs px-2"
                  />
                </div>
              ))}
            </div>
            <div className="border-t px-4 py-3 space-y-3">
              <div className="flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span>{formatCurrency(cartTotal)}</span>
              </div>
              <Button
                className="w-full"
                disabled={cart.length === 0 || loading}
                onClick={handleConfirm}
              >
                {loading ? 'Adicionando...' : 'Confirmar Pedido'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={onClose}>Cancelar</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProductGrid({ products, onAdd, cart }: { products: Product[]; onAdd: (p: Product) => void; cart: CartItem[] }) {
  if (products.length === 0) return (
    <p className="text-sm text-muted-foreground text-center py-8">Nenhum produto encontrado</p>
  )
  return (
    <div className="grid grid-cols-2 gap-2">
      {products.map((p) => {
        const qty = cart.find((i) => i.product.id === p.id && !i.comboKey)?.quantity ?? 0
        return (
          <button
            key={p.id}
            onClick={() => onAdd(p)}
            className="text-left p-3 rounded-lg border bg-background hover:border-primary hover:bg-primary/5 transition-colors relative"
          >
            {qty > 0 && (
              <Badge className="absolute top-2 right-2 w-5 h-5 p-0 flex items-center justify-center text-xs">
                {qty}
              </Badge>
            )}
            <p className="text-xs font-medium leading-tight line-clamp-2 pr-6">{p.name}</p>
            <p className="text-sm font-bold text-primary mt-1">{formatCurrency(p.price)}</p>
            {p.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{p.description}</p>
            )}
          </button>
        )
      })}
    </div>
  )
}
