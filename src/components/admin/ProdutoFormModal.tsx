import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { compressImage } from '@/lib/imageCompress'
import { Category, Ingredient, Product, ProductIngredient } from '@/types/database'
import { formatCurrency } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ChevronDown, ChevronUp, ImagePlus, X, Loader2, Plus, Trash2, Package } from 'lucide-react'

// ── Listas fiscais ──────────────────────────────────────────────────────────

const CSOSN_OPTIONS = [
  { value: '101', label: '101 – Tributada pelo SN com permissão de crédito' },
  { value: '102', label: '102 – Tributada pelo SN sem permissão de crédito' },
  { value: '103', label: '103 – Isenção do ICMS para faixa de receita bruta' },
  { value: '201', label: '201 – Tributada pelo SN c/ crédito e c/ ST' },
  { value: '202', label: '202 – Tributada pelo SN s/ crédito e c/ ST' },
  { value: '203', label: '203 – Isenção do ICMS no SN e c/ ST' },
  { value: '300', label: '300 – Imune' },
  { value: '400', label: '400 – Não tributada pelo Simples Nacional' },
  { value: '500', label: '500 – ICMS cobrado anteriormente por ST ou antecipação' },
  { value: '900', label: '900 – Outros' },
]

const ORIGEM_OPTIONS = [
  { value: 0, label: '0 – Nacional' },
  { value: 1, label: '1 – Estrangeira – Importação direta' },
  { value: 2, label: '2 – Estrangeira – Adquirida no mercado interno' },
  { value: 3, label: '3 – Nacional com Conteúdo de Importação > 40% e ≤ 70%' },
  { value: 4, label: '4 – Nacional – Processos produtivos básicos' },
  { value: 5, label: '5 – Nacional com Conteúdo de Importação ≤ 40%' },
  { value: 6, label: '6 – Estrangeira – Importação direta sem similar nacional' },
  { value: 7, label: '7 – Estrangeira – Mercado interno sem similar nacional' },
  { value: 8, label: '8 – Nacional com Conteúdo de Importação > 70%' },
]

const CFOP_OPTIONS = [
  { value: '5101', label: '5101 – Venda de produção do estabelecimento' },
  { value: '5102', label: '5102 – Venda de mercadoria adquirida de terceiros' },
  { value: '5111', label: '5111 – Venda de prod. do estabelecimento (Simples Nacional)' },
  { value: '5405', label: '5405 – Venda com substituição tributária' },
  { value: '5906', label: '5906 – Remessa para industrialização' },
  { value: '5929', label: '5929 – Outros lançamentos' },
  { value: '6101', label: '6101 – Venda de produção (interestadual)' },
  { value: '6102', label: '6102 – Venda de mercadoria de terceiros (interestadual)' },
]

// ── Máscaras ────────────────────────────────────────────────────────────────

function applyNcmMask(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 4) return d
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`
}

function applyCestMask(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 7)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
}

// ── Tipos ───────────────────────────────────────────────────────────────────

interface FormState {
  name: string
  category_id: string
  description: string
  price: string
  cost_price: string
  stock_quantity: string
  ncm: string
  cest: string
  cfop: string
  csosn: string
  origem: string
  sort_order: number
  active: boolean
  image_url: string | null
  has_ingredients: boolean
}

const defaultForm: FormState = {
  name: '',
  category_id: '',
  description: '',
  price: '',
  cost_price: '',
  stock_quantity: '0',
  ncm: '',
  cest: '',
  cfop: '',
  csosn: '',
  origem: '',
  sort_order: 0,
  active: true,
  image_url: null,
  has_ingredients: false,
}

interface LocalIngredient {
  ingredient_id: string
  quantity: number
  ingredient: Ingredient
}

interface Props {
  open: boolean
  product: Product | null
  fichaCusto?: number
  onClose: () => void
  onSave: () => void
}

// ── Upload helper ────────────────────────────────────────────────────────────

async function uploadProductImage(file: File, productId?: string): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const filename = `${productId ?? crypto.randomUUID()}-${Date.now()}.${ext}`
  const compressed = await compressImage(file)
  const { error } = await supabase.storage.from('product-images').upload(filename, compressed, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('product-images').getPublicUrl(filename)
  return data.publicUrl
}

// ── Componente ──────────────────────────────────────────────────────────────

export function ProdutoFormModal({ open, product, fichaCusto, onClose, onSave }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(defaultForm)
  const [error, setError] = useState<string | null>(null)
  const [fiscalOpen, setFiscalOpen] = useState(false)

  // Imagem
  const [imgPreview, setImgPreview] = useState<string | null>(null)
  const [imgUploading, setImgUploading] = useState(false)
  const imgInputRef = useRef<HTMLInputElement>(null)

  // Insumos locais (antes de salvar)
  const [localIngredients, setLocalIngredients] = useState<LocalIngredient[]>([])
  const [addIngId, setAddIngId] = useState('')
  const [addQty, setAddQty] = useState('1')

  // Carrega categorias
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', 'active'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories').select('*').eq('active', true).order('sort_order')
      if (error) throw error
      return data as Category[]
    },
  })

  // Carrega todos os insumos disponíveis
  const { data: allIngredients = [] } = useQuery({
    queryKey: ['ingredients'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from('ingredients').select('*').order('name')
      if (error) throw error
      return data as Ingredient[]
    },
  })

  // Inicializa form ao abrir
  useEffect(() => {
    if (open) {
      setError(null)
      setFiscalOpen(false)
      setImgUploading(false)
      setAddIngId('')
      setAddQty('1')

      if (product) {
        setForm({
          name: product.name,
          category_id: product.category_id ?? '',
          description: product.description ?? '',
          price: String(product.price),
          cost_price: product.cost_price > 0 ? String(product.cost_price) : '',
          stock_quantity: String(product.stock_quantity ?? 0),
          ncm: product.ncm ?? '',
          cest: product.cest ?? '',
          cfop: product.cfop ?? '',
          csosn: product.csosn ?? '',
          origem: product.origem !== null && product.origem !== undefined ? String(product.origem) : '',
          sort_order: product.sort_order,
          active: product.active,
          image_url: product.image_url ?? null,
          has_ingredients: product.has_ingredients ?? false,
        })
        setImgPreview(product.image_url ?? null)

        // Carrega insumos existentes do produto
        if (product.has_ingredients) {
          supabase
            .from('product_ingredients')
            .select('*, ingredients(*)')
            .eq('product_id', product.id)
            .then(({ data }) => {
              if (data) setLocalIngredients(
                (data as ProductIngredient[]).map((pi) => ({
                  ingredient_id: pi.ingredient_id,
                  quantity: pi.quantity,
                  ingredient: pi.ingredients,
                }))
              )
            })
        } else {
          setLocalIngredients([])
        }
      } else {
        setForm(defaultForm)
        setImgPreview(null)
        setLocalIngredients([])
      }
    }
  }, [open, product])

  // Custo total calculado pelos insumos
  const ingredientsTotalCost = localIngredients.reduce(
    (acc, li) => acc + li.quantity * li.ingredient.cost_per_unit,
    0
  )

  // Quando has_ingredients muda, atualiza cost_price automaticamente
  useEffect(() => {
    if (form.has_ingredients && localIngredients.length > 0) {
      setForm((f) => ({ ...f, cost_price: ingredientsTotalCost.toFixed(4) }))
    }
  }, [ingredientsTotalCost, form.has_ingredients])

  // ── Upload de imagem ──────────────────────────────────────────────────────

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImgUploading(true)
    setError(null)
    try {
      const url = await uploadProductImage(file, product?.id)
      setForm((f) => ({ ...f, image_url: url }))
      setImgPreview(url)
    } catch {
      setError('Erro ao fazer upload da imagem.')
    } finally {
      setImgUploading(false)
      if (imgInputRef.current) imgInputRef.current.value = ''
    }
  }

  function handleRemoveImage() {
    setForm((f) => ({ ...f, image_url: null }))
    setImgPreview(null)
  }

  // ── Insumos locais ────────────────────────────────────────────────────────

  const availableIngredients = allIngredients.filter(
    (ing) => !localIngredients.some((li) => li.ingredient_id === ing.id)
  )

  function handleAddIngredient() {
    if (!addIngId || !addQty || Number(addQty) <= 0) return
    const ingredient = allIngredients.find((i) => i.id === addIngId)
    if (!ingredient) return
    setLocalIngredients((prev) => [...prev, { ingredient_id: addIngId, quantity: Number(addQty), ingredient }])
    setAddIngId('')
    setAddQty('1')
  }

  function handleUpdateQty(ingredient_id: string, qty: string) {
    const n = Number(qty)
    if (n <= 0) return
    setLocalIngredients((prev) =>
      prev.map((li) => li.ingredient_id === ingredient_id ? { ...li, quantity: n } : li)
    )
  }

  function handleRemoveIngredient(ingredient_id: string) {
    setLocalIngredients((prev) => prev.filter((li) => li.ingredient_id !== ingredient_id))
  }

  // ── Salvar ────────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: async () => {
      const costPrice = form.has_ingredients
        ? ingredientsTotalCost
        : form.cost_price ? Number(form.cost_price) : 0

      const payload = {
        name: form.name.trim(),
        category_id: form.category_id || null,
        description: form.description.trim() || null,
        price: Number(form.price),
        cost_price: costPrice,
        stock_quantity: Number(form.stock_quantity) || 0,
        ncm: form.ncm || null,
        cest: form.cest || null,
        cfop: form.cfop || null,
        csosn: form.csosn || null,
        origem: form.origem !== '' ? Number(form.origem) : null,
        sort_order: form.sort_order,
        active: form.active,
        image_url: form.image_url,
        has_ingredients: form.has_ingredients,
      }

      let productId: string

      if (product) {
        const { error } = await supabase.from('products').update(payload).eq('id', product.id)
        if (error) throw error
        productId = product.id
      } else {
        const { data, error } = await supabase.from('products').insert(payload).select('id').single()
        if (error) throw error
        productId = data.id
      }

      // Sincroniza product_ingredients
      await supabase.from('product_ingredients').delete().eq('product_id', productId)
      if (form.has_ingredients && localIngredients.length > 0) {
        const rows = localIngredients.map((li) => ({
          product_id: productId,
          ingredient_id: li.ingredient_id,
          quantity: li.quantity,
        }))
        const { error } = await supabase.from('product_ingredients').insert(rows)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      onSave()
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('O nome é obrigatório.'); return }
    if (!form.price || Number(form.price) <= 0) { setError('Informe um preço de venda válido.'); return }
    if (form.has_ingredients && localIngredients.length === 0) {
      setError('Adicione ao menos um insumo ou desmarque a opção de composição.')
      return
    }
    mutation.mutate()
  }

  const price = Number(form.price)
  const costForMargem = form.has_ingredients ? ingredientsTotalCost : (Number(form.cost_price) || 0)
  const fichaCustoEfetivo = fichaCusto !== undefined ? fichaCusto : costForMargem
  const margem = fichaCustoEfetivo > 0 && price > 0
    ? ((price - fichaCustoEfetivo) / price) * 100
    : null

  const set = (field: keyof FormState) => (v: string) =>
    setForm((f) => ({ ...f, [field]: v }))

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Imagem ── */}
          <div className="space-y-1.5">
            <Label>Imagem do produto</Label>
            <input
              ref={imgInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleImageChange}
            />
            {imgPreview ? (
              <div className="relative w-full h-40 rounded-lg overflow-hidden border bg-muted group">
                <img src={imgPreview} alt="Prévia" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => imgInputRef.current?.click()} disabled={imgUploading}>
                    {imgUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                    Alterar
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={handleRemoveImage}>
                    <X className="w-3.5 h-3.5" />
                    Remover
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => imgInputRef.current?.click()}
                disabled={imgUploading}
                className="w-full h-32 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              >
                {imgUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImagePlus className="w-6 h-6" />}
                <span className="text-sm">{imgUploading ? 'Enviando...' : 'Clique para adicionar imagem'}</span>
                <span className="text-xs opacity-60">JPG, PNG, WebP — máx. 5 MB</span>
              </button>
            )}
          </div>

          <Separator />

          {/* ── Informações básicas ── */}
          <div className="space-y-1">
            <Label htmlFor="prod-name">Nome *</Label>
            <Input id="prod-name" value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="Ex: Pão de Queijo" />
          </div>

          <div className="space-y-1">
            <Label>Categoria</Label>
            <Select value={form.category_id} onValueChange={set('category_id')}>
              <SelectTrigger><SelectValue placeholder="Selecionar categoria..." /></SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="prod-desc">Descrição</Label>
            <Textarea id="prod-desc" value={form.description} onChange={(e) => set('description')(e.target.value)} placeholder="Descrição opcional" rows={2} />
          </div>

          {/* ── Preços ── */}
          <Separator />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preços</p>

          {/* Toggle insumos */}
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div>
              <p className="text-sm font-medium">Composto por insumos</p>
              <p className="text-xs text-muted-foreground">O custo é calculado automaticamente a partir dos insumos</p>
            </div>
            <Switch
              checked={form.has_ingredients}
              onCheckedChange={(v) => {
                setForm((f) => ({ ...f, has_ingredients: v }))
                if (!v) setLocalIngredients([])
              }}
            />
          </div>

          {/* Custo manual — só aparece quando has_ingredients está desligado */}
          {!form.has_ingredients && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="prod-cost">Preço de Custo (R$)</Label>
                <Input id="prod-cost" type="number" min={0} step="0.01" value={form.cost_price} onChange={(e) => set('cost_price')(e.target.value)} placeholder="0,00" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="prod-price">Preço de Venda (R$) *</Label>
                <Input id="prod-price" type="number" min={0} step="0.01" value={form.price} onChange={(e) => set('price')(e.target.value)} placeholder="0,00" />
              </div>
            </div>
          )}

          {/* Preço de venda — quando has_ingredients, aparece sozinho */}
          {form.has_ingredients && (
            <div className="space-y-1">
              <Label htmlFor="prod-price2">Preço de Venda (R$) *</Label>
              <Input id="prod-price2" type="number" min={0} step="0.01" value={form.price} onChange={(e) => set('price')(e.target.value)} placeholder="0,00" />
            </div>
          )}

          {margem !== null && (
            <p className={`text-xs -mt-1 ${margem >= 0 ? 'text-green-600' : 'text-destructive'}`}>
              Margem de contribuição: {margem.toFixed(1)}%
              {fichaCusto !== undefined && ` (ficha técnica: ${formatCurrency(fichaCusto)})`}
            </p>
          )}

          {/* ── Seção de Insumos ── */}
          {form.has_ingredients && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Composição / Insumos</p>
                {localIngredients.length > 0 && (
                  <span className="text-sm font-bold text-primary">
                    Custo total: {formatCurrency(ingredientsTotalCost)}
                  </span>
                )}
              </div>

              {/* Lista de insumos adicionados */}
              {localIngredients.length === 0 ? (
                <div className="flex flex-col items-center py-4 text-muted-foreground gap-1">
                  <Package className="w-6 h-6 opacity-30" />
                  <p className="text-xs">Nenhum insumo adicionado ainda</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="pb-1.5 text-left font-medium">Insumo</th>
                        <th className="pb-1.5 text-left font-medium">Un.</th>
                        <th className="pb-1.5 text-left font-medium w-20">Qtd</th>
                        <th className="pb-1.5 text-right font-medium">Custo Un.</th>
                        <th className="pb-1.5 text-right font-medium">Total</th>
                        <th className="pb-1.5 w-6" />
                      </tr>
                    </thead>
                    <tbody>
                      {localIngredients.map((li) => (
                        <tr key={li.ingredient_id} className="border-b last:border-0">
                          <td className="py-1.5 pr-2 font-medium">{li.ingredient.name}</td>
                          <td className="py-1.5 pr-2 text-muted-foreground">{li.ingredient.unit}</td>
                          <td className="py-1.5 pr-2">
                            <Input
                              className="h-6 w-16 text-xs px-1.5"
                              type="number"
                              min={0.001}
                              step="any"
                              value={li.quantity}
                              onChange={(e) => handleUpdateQty(li.ingredient_id, e.target.value)}
                            />
                          </td>
                          <td className="py-1.5 pr-2 text-right text-muted-foreground">
                            {formatCurrency(li.ingredient.cost_per_unit)}
                          </td>
                          <td className="py-1.5 pr-2 text-right font-semibold">
                            {formatCurrency(li.quantity * li.ingredient.cost_per_unit)}
                          </td>
                          <td className="py-1.5">
                            <button
                              type="button"
                              onClick={() => handleRemoveIngredient(li.ingredient_id)}
                              className="text-destructive hover:text-destructive/80"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Adicionar insumo */}
              <div className="flex flex-col sm:flex-row gap-2 pt-1 border-t">
                <Select value={addIngId} onValueChange={setAddIngId}>
                  <SelectTrigger className="flex-1 h-8 text-xs">
                    <SelectValue placeholder="Selecionar insumo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableIngredients.length === 0
                      ? <SelectItem value="__none__" disabled>Todos os insumos já adicionados</SelectItem>
                      : availableIngredients.map((ing) => (
                          <SelectItem key={ing.id} value={ing.id}>
                            {ing.name} ({ing.unit}) — {formatCurrency(ing.cost_per_unit)}/{ing.unit}
                          </SelectItem>
                        ))
                    }
                  </SelectContent>
                </Select>
                <Input
                  className="w-24 h-8 text-xs"
                  type="number"
                  min={0.001}
                  step="any"
                  placeholder="Qtd"
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={handleAddIngredient}
                  disabled={!addIngId || !addQty || Number(addQty) <= 0}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Adicionar
                </Button>
              </div>
            </div>
          )}

          {/* ── Estoque ── */}
          <Separator />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estoque</p>

          <div className="space-y-1">
            <Label htmlFor="prod-stock">Quantidade em Estoque</Label>
            <Input id="prod-stock" type="number" min={0} step="0.001" value={form.stock_quantity} onChange={(e) => set('stock_quantity')(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              A quantidade é baixada automaticamente ao lançar o item em uma comanda.
            </p>
          </div>

          {/* ── Dados Fiscais (colapsível) ── */}
          <Separator />
          <button
            type="button"
            onClick={() => setFiscalOpen((v) => !v)}
            className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
          >
            <span>Dados Fiscais</span>
            {fiscalOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {fiscalOpen && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="prod-ncm">NCM</Label>
                  <Input id="prod-ncm" value={form.ncm} onChange={(e) => set('ncm')(applyNcmMask(e.target.value))} placeholder="0000.00.00" maxLength={10} inputMode="numeric" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="prod-cest">CEST</Label>
                  <Input id="prod-cest" value={form.cest} onChange={(e) => set('cest')(applyCestMask(e.target.value))} placeholder="00.000.00" maxLength={9} inputMode="numeric" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>CFOP</Label>
                <Select value={form.cfop} onValueChange={set('cfop')}>
                  <SelectTrigger><SelectValue placeholder="Selecionar CFOP..." /></SelectTrigger>
                  <SelectContent>
                    {CFOP_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>CSOSN <span className="text-muted-foreground font-normal text-xs">(Simples Nacional)</span></Label>
                <Select value={form.csosn} onValueChange={set('csosn')}>
                  <SelectTrigger><SelectValue placeholder="Selecionar CSOSN..." /></SelectTrigger>
                  <SelectContent>
                    {CSOSN_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Origem</Label>
                <Select value={form.origem} onValueChange={set('origem')}>
                  <SelectTrigger><SelectValue placeholder="Selecionar origem..." /></SelectTrigger>
                  <SelectContent>
                    {ORIGEM_OPTIONS.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* ── Configurações ── */}
          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="prod-order">Ordem de Exibição</Label>
              <Input id="prod-order" type="number" min={0} value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))} />
            </div>
            <div className="flex items-end pb-1 gap-3">
              <Switch id="prod-active" checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
              <Label htmlFor="prod-active">Ativo</Label>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
