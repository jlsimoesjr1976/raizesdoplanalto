import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Category, Product } from '@/types/database'
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
import { ChevronDown, ChevronUp, ImagePlus, X, Loader2 } from 'lucide-react'

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
}

interface Props {
  open: boolean
  product: Product | null
  fichaCusto?: number
  onClose: () => void
  onSave: () => void
}

// ── Componente ──────────────────────────────────────────────────────────────

async function uploadProductImage(file: File, productId?: string): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const filename = `${productId ?? crypto.randomUUID()}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('product-images').upload(filename, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('product-images').getPublicUrl(filename)
  return data.publicUrl
}

export function ProdutoFormModal({ open, product, fichaCusto, onClose, onSave }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(defaultForm)
  const [error, setError] = useState<string | null>(null)
  const [fiscalOpen, setFiscalOpen] = useState(false)
  const [imgPreview, setImgPreview] = useState<string | null>(null)
  const [imgUploading, setImgUploading] = useState(false)
  const imgInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (open) {
      setError(null)
      setFiscalOpen(false)
      setImgUploading(false)
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
        })
        setImgPreview(product.image_url ?? null)
      } else {
        setForm(defaultForm)
        setImgPreview(null)
      }
    }
  }, [open, product])

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
      setError('Erro ao fazer upload da imagem. Verifique se o bucket "product-images" está criado no Supabase.')
    } finally {
      setImgUploading(false)
      if (imgInputRef.current) imgInputRef.current.value = ''
    }
  }

  function handleRemoveImage() {
    setForm((f) => ({ ...f, image_url: null }))
    setImgPreview(null)
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        category_id: form.category_id || null,
        description: form.description.trim() || null,
        price: Number(form.price),
        cost_price: form.cost_price ? Number(form.cost_price) : 0,
        stock_quantity: Number(form.stock_quantity) || 0,
        ncm: form.ncm || null,
        cest: form.cest || null,
        cfop: form.cfop || null,
        csosn: form.csosn || null,
        origem: form.origem !== '' ? Number(form.origem) : null,
        sort_order: form.sort_order,
        active: form.active,
        image_url: form.image_url,
      }
      if (product) {
        const { error } = await supabase.from('products').update(payload).eq('id', product.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('products').insert(payload)
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
    mutation.mutate()
  }

  const price = Number(form.price)
  const costPrice = Number(form.cost_price) || 0
  const fichaCustoEfetivo = fichaCusto !== undefined ? fichaCusto : costPrice
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
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => imgInputRef.current?.click()}
                    disabled={imgUploading}
                  >
                    {imgUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                    Alterar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={handleRemoveImage}
                  >
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
                {imgUploading
                  ? <Loader2 className="w-6 h-6 animate-spin" />
                  : <ImagePlus className="w-6 h-6" />}
                <span className="text-sm">{imgUploading ? 'Enviando...' : 'Clique para adicionar imagem'}</span>
                <span className="text-xs opacity-60">JPG, PNG, WebP — máx. 5 MB</span>
              </button>
            )}
          </div>

          <Separator />

          {/* ── Informações básicas ── */}
          <div className="space-y-1">
            <Label htmlFor="prod-name">Nome *</Label>
            <Input
              id="prod-name"
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
              placeholder="Ex: Pão de Queijo"
            />
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
            <Textarea
              id="prod-desc"
              value={form.description}
              onChange={(e) => set('description')(e.target.value)}
              placeholder="Descrição opcional"
              rows={2}
            />
          </div>

          {/* ── Preços ── */}
          <Separator />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preços</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="prod-cost">Preço de Custo (R$)</Label>
              <Input
                id="prod-cost"
                type="number"
                min={0}
                step="0.01"
                value={form.cost_price}
                onChange={(e) => set('cost_price')(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="prod-price">Preço de Venda (R$) *</Label>
              <Input
                id="prod-price"
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => set('price')(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>
          {margem !== null && (
            <p className={`text-xs -mt-1 ${margem >= 0 ? 'text-green-600' : 'text-destructive'}`}>
              Margem de contribuição: {margem.toFixed(1)}%
              {fichaCusto !== undefined && ` (ficha técnica: ${formatCurrency(fichaCusto)})`}
            </p>
          )}

          {/* ── Estoque ── */}
          <Separator />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estoque</p>

          <div className="space-y-1">
            <Label htmlFor="prod-stock">Quantidade em Estoque</Label>
            <Input
              id="prod-stock"
              type="number"
              min={0}
              step="0.001"
              value={form.stock_quantity}
              onChange={(e) => set('stock_quantity')(e.target.value)}
            />
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
              {/* NCM e CEST */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="prod-ncm">NCM</Label>
                  <Input
                    id="prod-ncm"
                    value={form.ncm}
                    onChange={(e) => set('ncm')(applyNcmMask(e.target.value))}
                    placeholder="0000.00.00"
                    maxLength={10}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="prod-cest">CEST</Label>
                  <Input
                    id="prod-cest"
                    value={form.cest}
                    onChange={(e) => set('cest')(applyCestMask(e.target.value))}
                    placeholder="00.000.00"
                    maxLength={9}
                    inputMode="numeric"
                  />
                </div>
              </div>

              {/* CFOP */}
              <div className="space-y-1">
                <Label>CFOP</Label>
                <Select value={form.cfop} onValueChange={set('cfop')}>
                  <SelectTrigger><SelectValue placeholder="Selecionar CFOP..." /></SelectTrigger>
                  <SelectContent>
                    {CFOP_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* CSOSN */}
              <div className="space-y-1">
                <Label>CSOSN <span className="text-muted-foreground font-normal text-xs">(Simples Nacional)</span></Label>
                <Select value={form.csosn} onValueChange={set('csosn')}>
                  <SelectTrigger><SelectValue placeholder="Selecionar CSOSN..." /></SelectTrigger>
                  <SelectContent>
                    {CSOSN_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Origem */}
              <div className="space-y-1">
                <Label>Origem</Label>
                <Select value={form.origem} onValueChange={set('origem')}>
                  <SelectTrigger><SelectValue placeholder="Selecionar origem..." /></SelectTrigger>
                  <SelectContent>
                    {ORIGEM_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                    ))}
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
              <Input
                id="prod-order"
                type="number"
                min={0}
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>
            <div className="flex items-end pb-1 gap-3">
              <Switch
                id="prod-active"
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
              />
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
