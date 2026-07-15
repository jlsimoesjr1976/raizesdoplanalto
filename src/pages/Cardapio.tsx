import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { CustomerProvider, useCustomer } from '@/contexts/CustomerContext'
import { placeOrder } from '@/lib/customerApi'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ShoppingCart, Plus, Minus, Search, UtensilsCrossed, LogOut, User, CheckCircle2, Loader2, Trash2, Eye, EyeOff, Package2 } from 'lucide-react'
import logoImg from '@/assets/logo.png'
import type { Product, Category } from '@/types/database'
import { comboAvailable, comboFinal, comboTotal, comboMaxQty, type ComboWithItems } from '@/lib/combos'

interface CartItem {
  product: Product
  quantity: number
  notes: string
  /** Presente quando a linha é um combo (product é um pseudo-produto com o preço final) */
  comboId?: string
}

function CardapioInner() {
  const { customer, token, loading: authLoading, logout } = useCustomer()
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState('all')
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [orderNotes, setOrderNotes] = useState('')
  const pendingFinalize = useRef(false)

  const { data: categories = [] } = useQuery({
    queryKey: ['pub-categories'],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('*').eq('active', true).eq('show_in_menu', true).order('sort_order')
      return (data ?? []) as Category[]
    },
  })
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['pub-products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*').eq('active', true).eq('show_in_menu', true).gte('stock_quantity', 1).order('name')
      return (data ?? []) as Product[]
    },
  })
  const { data: combos = [] } = useQuery({
    queryKey: ['pub-combos'],
    queryFn: async () => {
      const { data } = await supabase.from('combos').select('*, combo_items(*, products(*))').eq('active', true).eq('show_in_menu', true).order('name')
      return ((data ?? []) as ComboWithItems[]).filter(comboAvailable)
    },
  })
  const { data: lojaAberta = true } = useQuery({
    queryKey: ['pub-loja-aberta'],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('value').eq('key', 'loja_aberta').maybeSingle()
      return data ? data.value !== false : true
    },
  })

  const filtered = useMemo(() => {
    const visibleCats = new Set(categories.map((c) => c.id))
    return products.filter((p) => {
      // Produto de categoria oculta não aparece nem em "Todos"
      if (p.category_id && !visibleCats.has(p.category_id)) return false
      const mc = activeCat === 'all' || p.category_id === activeCat
      const ms = !search || p.name.toLowerCase().includes(search.toLowerCase())
      return mc && ms
    })
  }, [products, categories, activeCat, search])

  const visibleCombos = useMemo(() => combos.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  ), [combos, search])

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0)
  const cartTotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0)

  function addToCart(p: Product) {
    setCart((prev) => {
      const ex = prev.find((i) => i.product.id === p.id)
      if (ex) return prev.map((i) => i.product.id === p.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product: p, quantity: 1, notes: '' }]
    })
  }

  function addComboToCart(c: ComboWithItems) {
    // Combo entra como uma linha única, com o preço final (o servidor expande e valida)
    const pseudo = { id: c.id, name: `Combo: ${c.name}`, price: comboFinal(c), image_url: c.image_url } as Product
    setCart((prev) => {
      const ex = prev.find((i) => i.comboId === c.id)
      if (ex) return prev.map((i) => i.comboId === c.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product: pseudo, quantity: 1, notes: '', comboId: c.id }]
    })
  }
  function updateQty(id: string, delta: number) {
    setCart((prev) => prev.map((i) => i.product.id === id ? { ...i, quantity: i.quantity + delta } : i).filter((i) => i.quantity > 0))
  }
  function updateNotes(id: string, notes: string) {
    setCart((prev) => prev.map((i) => i.product.id === id ? { ...i, notes } : i))
  }

  function handleFinalizar() {
    if (cart.length === 0) return
    if (!lojaAberta) { alert('A loja está fechada para pedidos no momento.'); return }
    if (!customer || !token) { pendingFinalize.current = true; setAuthOpen(true); return }
    void doPlaceOrder(token)
  }

  // Dispara o envio após autenticar (quando o token já está no estado)
  useEffect(() => {
    if (pendingFinalize.current && token && customer && cart.length > 0) {
      pendingFinalize.current = false
      void doPlaceOrder(token)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, customer])

  async function doPlaceOrder(tk: string) {
    if (!tk) return
    setPlacing(true)
    const res = await placeOrder(tk, cart.map((i) => (
      i.comboId
        ? { combo_id: i.comboId, quantity: i.quantity, notes: i.notes || undefined }
        : { product_id: i.product.id, quantity: i.quantity, notes: i.notes || undefined }
    )), orderNotes || undefined)
    setPlacing(false)
    if (res.error) { alert(res.error); return }
    setCart([]); setOrderNotes(''); setCartOpen(false); setSuccess(res.order_id ?? 'ok')
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[hsl(145,60%,28%)] text-white shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src={logoImg} alt="Raízes do Planalto" className="w-9 h-9 rounded object-contain bg-black/20" />
          <div className="flex-1 min-w-0">
            <h1 className="font-bold leading-tight">Raízes do Planalto</h1>
            <p className="text-[11px] text-white/70 leading-tight">Cozinha Brasileira</p>
          </div>
          {customer ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:flex items-center gap-1 text-sm"><User className="w-4 h-4" />{customer.name.split(' ')[0]}</span>
              <button onClick={logout} title="Sair" className="p-1.5 rounded hover:bg-white/10"><LogOut className="w-4 h-4" /></button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setAuthOpen(true)} disabled={authLoading}>Entrar</Button>
          )}
          <button onClick={() => setCartOpen(true)} className="relative p-2 rounded-lg hover:bg-white/10">
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && <span className="absolute -top-1 -right-1 bg-amber-400 text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{cartCount}</span>}
          </button>
        </div>
      </header>

      {!lojaAberta && (
        <div className="bg-red-600 text-white text-center text-sm font-medium py-2 px-4">
          🔴 Loja fechada no momento — você pode ver o cardápio, mas não é possível fazer pedidos agora.
        </div>
      )}

      {/* Categorias (topo) + busca */}
      <div className="sticky top-[60px] z-10 bg-neutral-50/95 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar no cardápio..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-white" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <CatChip label="Todos" active={activeCat === 'all'} onClick={() => setActiveCat('all')} />
            {combos.length > 0 && <CatChip label="Combos" active={activeCat === 'combos'} onClick={() => setActiveCat('combos')} />}
            {categories.map((c) => (
              <CatChip key={c.id} label={c.name} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} />
            ))}
          </div>
        </div>
      </div>

      {/* Produtos */}
      <main className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {isLoading && <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{[...Array(6)].map((_, i) => <div key={i} className="h-52 rounded-xl bg-neutral-200 animate-pulse" />)}</div>}

        {/* Combos */}
        {(activeCat === 'all' || activeCat === 'combos') && visibleCombos.length > 0 && (
          <div>
            {activeCat === 'all' && <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Package2 className="w-4 h-4" /> Combos</h2>}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {visibleCombos.map((c) => {
                const qty = cart.find((i) => i.comboId === c.id)?.quantity ?? 0
                const total = comboTotal(c)
                const final = comboFinal(c)
                const maxQty = comboMaxQty(c)
                return (
                  <div key={c.id} className="bg-white rounded-xl border-2 border-amber-200 overflow-hidden flex flex-col">
                    <div className="h-28 sm:h-32 bg-neutral-100 flex items-center justify-center overflow-hidden relative">
                      {c.image_url ? <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" /> : <Package2 className="w-8 h-8 text-neutral-300" />}
                      {Number(c.discount_percent) > 0 && (
                        <span className="absolute top-2 left-2 bg-amber-400 text-black text-[10px] font-bold px-1.5 py-0.5 rounded">
                          -{Number(c.discount_percent).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                        </span>
                      )}
                    </div>
                    <div className="p-3 flex flex-col gap-1.5 flex-1">
                      <p className="text-sm font-semibold leading-tight line-clamp-2">{c.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {(c.combo_items ?? []).map((i) => `${i.quantity}x ${i.products?.name}`).join(', ')}
                      </p>
                      <div className="mt-auto flex items-center justify-between pt-1">
                        <div className="leading-tight">
                          {final < total && <span className="block text-[10px] text-muted-foreground line-through">{formatCurrency(total)}</span>}
                          <span className="font-bold text-green-700">{formatCurrency(final)}</span>
                        </div>
                        {qty === 0 ? (
                          <Button size="sm" className="h-8 px-2.5" onClick={() => addComboToCart(c)}><Plus className="w-4 h-4" /></Button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => updateQty(c.id, -1)} className="w-7 h-7 rounded-md border flex items-center justify-center bg-white"><Minus className="w-3.5 h-3.5" /></button>
                            <span className="w-5 text-center text-sm font-semibold">{qty}</span>
                            <button
                              onClick={() => updateQty(c.id, 1)}
                              disabled={qty >= maxQty}
                              title={qty >= maxQty ? 'Estoque máximo atingido' : undefined}
                              className="w-7 h-7 rounded-md border flex items-center justify-center bg-white disabled:opacity-40"
                            ><Plus className="w-3.5 h-3.5" /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!isLoading && filtered.length === 0 && visibleCombos.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <UtensilsCrossed className="w-10 h-10 opacity-30" />
            <p className="text-sm">Nenhum item encontrado.</p>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map((p) => {
            const qty = cart.find((i) => i.product.id === p.id)?.quantity ?? 0
            return (
              <div key={p.id} className="bg-white rounded-xl border overflow-hidden flex flex-col">
                <div className="h-28 sm:h-32 bg-neutral-100 flex items-center justify-center overflow-hidden">
                  {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <UtensilsCrossed className="w-8 h-8 text-neutral-300" />}
                </div>
                <div className="p-3 flex flex-col gap-1.5 flex-1">
                  <p className="text-sm font-semibold leading-tight line-clamp-2">{p.name}</p>
                  {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                  <div className="mt-auto flex items-center justify-between pt-1">
                    <span className="font-bold text-green-700">{formatCurrency(p.price)}</span>
                    {qty === 0 ? (
                      <Button size="sm" className="h-8 px-2.5" onClick={() => addToCart(p)}><Plus className="w-4 h-4" /></Button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => updateQty(p.id, -1)} className="w-7 h-7 rounded-md border flex items-center justify-center bg-white"><Minus className="w-3.5 h-3.5" /></button>
                        <span className="w-5 text-center text-sm font-semibold">{qty}</span>
                        <button onClick={() => updateQty(p.id, 1)} className="w-7 h-7 rounded-md border flex items-center justify-center bg-white"><Plus className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {/* Botão flutuante do carrinho */}
      {cartCount > 0 && !cartOpen && (
        <div className="fixed bottom-4 inset-x-0 px-4 z-20">
          <div className="max-w-4xl mx-auto">
            <Button className="w-full h-12 shadow-lg justify-between" onClick={() => setCartOpen(true)}>
              <span className="flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> {cartCount} {cartCount === 1 ? 'item' : 'itens'}</span>
              <span>{formatCurrency(cartTotal)}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Carrinho */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="p-4 border-b"><SheetTitle>Seu pedido</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {cart.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">Seu carrinho está vazio.</p>}
            {cart.map((i) => (
              <div key={i.product.id} className="flex gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2">
                    <p className="text-sm font-medium">{i.product.name}</p>
                    <button onClick={() => updateQty(i.product.id, -i.quantity)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <button onClick={() => updateQty(i.product.id, -1)} className="w-7 h-7 rounded-md border flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></button>
                    <span className="w-6 text-center text-sm font-semibold">{i.quantity}</span>
                    <button onClick={() => updateQty(i.product.id, 1)} className="w-7 h-7 rounded-md border flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
                    <span className="ml-auto text-sm font-semibold">{formatCurrency(i.product.price * i.quantity)}</span>
                  </div>
                  <Input placeholder="Observação (ex.: sem cebola)" value={i.notes} onChange={(e) => updateNotes(i.product.id, e.target.value)} className="h-8 text-xs mt-2" />
                </div>
              </div>
            ))}
            {cart.length > 0 && (
              <div className="pt-2">
                <Label className="text-xs">Observações do pedido</Label>
                <Input placeholder="Alguma observação geral?" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} className="mt-1" />
              </div>
            )}
          </div>
          {cart.length > 0 && (
            <div className="border-t p-4 space-y-3">
              <div className="flex justify-between font-semibold"><span>Total</span><span>{formatCurrency(cartTotal)}</span></div>
              <Button className="w-full h-11" onClick={handleFinalizar} disabled={placing}>
                {placing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</> : (customer ? 'Finalizar pedido' : 'Entrar e finalizar')}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AuthDialog open={authOpen} onClose={() => { pendingFinalize.current = false; setAuthOpen(false) }} onAuthed={() => setAuthOpen(false)} />

      {/* Sucesso */}
      <Dialog open={!!success} onOpenChange={(v) => !v && setSuccess(null)}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="w-14 h-14 text-green-600" />
            <h2 className="text-xl font-bold">Pedido enviado!</h2>
            <p className="text-sm text-muted-foreground">Recebemos seu pedido e já vamos prepará-lo. Obrigado! 💚</p>
            <Button className="w-full mt-2" onClick={() => setSuccess(null)}>Fazer novo pedido</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CatChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors border ${active ? 'bg-[hsl(145,60%,28%)] text-white border-transparent' : 'bg-white text-neutral-700 hover:bg-neutral-100'}`}>
      {label}
    </button>
  )
}

function AuthDialog({ open, onClose, onAuthed }: { open: boolean; onClose: () => void; onAuthed: () => void }) {
  const { login, signup } = useCustomer()
  const [tab, setTab] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [addressRef, setAddressRef] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError(''); setBusy(true)
    if (tab === 'signup' && !address.trim()) { setError('Informe o endereço de entrega.'); setBusy(false); return }
    const err = tab === 'login'
      ? await login(email.trim(), password)
      : await signup({ name: name.trim(), email: email.trim(), phone: phone.replace(/\D/g, '') || undefined, address: address.trim(), address_reference: addressRef.trim() || undefined, password })
    setBusy(false)
    if (err) { setError(err); return }
    onAuthed()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Acesse sua conta</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setError('') }}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="login">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Criar conta</TabsTrigger>
          </TabsList>
          <TabsContent value="signup" className="space-y-3 pt-3">
            <div className="space-y-1.5"><Label>Nome *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" /></div>
            <div className="space-y-1.5"><Label>Telefone (WhatsApp)</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" inputMode="tel" /></div>
            <div className="space-y-1.5"><Label>Endereço de entrega *</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, bairro" /></div>
            <div className="space-y-1.5"><Label>Ponto de referência</Label><Input value={addressRef} onChange={(e) => setAddressRef(e.target.value)} placeholder="Ex.: próximo à praça" /></div>
          </TabsContent>
          <div className="space-y-3 pt-3">
            <div className="space-y-1.5"><Label>E-mail *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" /></div>
            <div className="space-y-1.5">
              <Label>Senha *</Label>
              <div className="relative">
                <Input type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tab === 'signup' ? 'Mínimo 6 caracteres' : 'Sua senha'} className="pr-10" />
                <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (tab === 'login' ? 'Entrar' : 'Criar conta e continuar')}
            </Button>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

export default function Cardapio() {
  return (
    <CustomerProvider>
      <CardapioInner />
    </CustomerProvider>
  )
}
