import { useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Category, Product, PrepStation } from '@/types/database'
import { formatCurrency } from '@/lib/utils'
import { ProdutoFormModal } from './ProdutoFormModal'
import { FichaTecnicaModal } from './FichaTecnicaModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Pencil, Trash2, ClipboardList, UtensilsCrossed, Package, AlertTriangle, Copy, Camera, Loader2, FileSpreadsheet, LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ImportXlsxModal } from './ImportXlsxModal'
import { produtosImportConfig } from '@/lib/importConfigs'

const CATEGORY_COLORS = [
  'bg-amber-100 text-amber-800',
  'bg-green-100 text-green-800',
  'bg-blue-100 text-blue-800',
  'bg-purple-100 text-purple-800',
  'bg-pink-100 text-pink-800',
  'bg-orange-100 text-orange-800',
  'bg-teal-100 text-teal-800',
  'bg-red-100 text-red-800',
]

function categoryColor(categoryId: string | null, categories: Category[]): string {
  if (!categoryId) return 'bg-gray-100 text-gray-700'
  const idx = categories.findIndex((c) => c.id === categoryId)
  return CATEGORY_COLORS[idx % CATEGORY_COLORS.length] ?? 'bg-gray-100 text-gray-700'
}

type ProductWithCategory = Product & { categories?: Category }

const PREP_STATION_UI: Record<'na' | 'bar' | 'cozinha', { label: string; className: string }> = {
  na:      { label: 'N/A',     className: 'bg-muted text-muted-foreground hover:bg-muted/80' },
  bar:     { label: 'Bar',     className: 'bg-purple-100 text-purple-800 hover:bg-purple-200' },
  cozinha: { label: 'Cozinha', className: 'bg-amber-100 text-amber-800 hover:bg-amber-200' },
}

/** Ciclo do botão: N/A → Bar → Cozinha → N/A */
function nextPrepStation(cur: PrepStation): PrepStation {
  if (cur === null) return 'bar'
  if (cur === 'bar') return 'cozinha'
  return null
}

function PrepStationButton({ station, onCycle }: { station: PrepStation; onCycle: () => void }) {
  const ui = PREP_STATION_UI[station ?? 'na']
  return (
    <button
      type="button"
      title="Definir fila de preparo (clique para alternar)"
      onClick={(e) => { e.stopPropagation(); onCycle() }}
      className={cn('text-xs font-medium px-2 py-0.5 rounded-full transition-colors', ui.className)}
    >
      {ui.label}
    </button>
  )
}

async function uploadProductImage(productId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const filename = `${productId}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('product-images').upload(filename, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('product-images').getPublicUrl(filename)
  return data.publicUrl
}

interface ProductCardProps {
  product: ProductWithCategory
  categories: Category[]
  onEdit: () => void
  onFicha: () => void
  onDuplicate: () => void
  onDelete: () => void
  onCyclePrep: () => void
  duplicating: boolean
  deleting: boolean
  onImageUpdated: () => void
}

function ProductCard({ product: p, categories, onEdit, onFicha, onDuplicate, onDelete, onCyclePrep, duplicating, deleting, onImageUpdated }: ProductCardProps) {
  const [uploading, setUploading] = useState(false)
  const [localImage, setLocalImage] = useState<string | null>(p.image_url ?? null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadProductImage(p.id, file)
      await supabase.from('products').update({ image_url: url }).eq('id', p.id)
      setLocalImage(url)
      onImageUpdated()
    } catch {
      alert('Erro ao fazer upload. Verifique se o bucket "product-images" está criado no Supabase.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Card className="overflow-hidden">
      {/* Imagem no topo do card */}
      <div
        className="relative w-full h-36 bg-muted group cursor-pointer"
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleImageUpload}
        />
        {localImage ? (
          <img src={localImage} alt={p.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground/40">
            <UtensilsCrossed className="w-8 h-8" />
          </div>
        )}
        {/* Overlay ao hover */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {uploading
            ? <Loader2 className="w-6 h-6 text-white animate-spin" />
            : <Camera className="w-6 h-6 text-white" />}
        </div>
      </div>

      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{p.name}</p>
            {p.categories && (
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 font-medium ${categoryColor(p.category_id, categories)}`}>
                {p.categories.name}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant={p.active ? 'default' : 'secondary'} className="text-xs">
              {p.active ? 'Ativo' : 'Inativo'}
            </Badge>
            <PrepStationButton station={p.prep_station} onCycle={onCyclePrep} />
          </div>
        </div>

        {p.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
        )}

        <div className="flex items-center justify-between">
          <p className="text-lg font-bold text-green-600">{formatCurrency(p.price)}</p>
          <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
            p.stock_quantity <= 0 ? 'bg-red-100 text-red-700'
            : p.stock_quantity <= 5 ? 'bg-amber-100 text-amber-700'
            : 'bg-muted text-muted-foreground'
          }`}>
            {p.stock_quantity <= 0 ? <AlertTriangle className="w-3 h-3" /> : <Package className="w-3 h-3" />}
            {p.stock_quantity <= 0 ? 'Sem estoque' : `${p.stock_quantity} un`}
          </div>
        </div>

        <div className="flex gap-1.5 pt-1">
          <Button size="sm" variant="outline" className="flex-1" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5 mr-1" />
            Editar
          </Button>
          <Button size="sm" variant="outline" title="Ficha Técnica" onClick={onFicha}>
            <ClipboardList className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" title="Duplicar produto" onClick={onDuplicate} disabled={duplicating}>
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" title="Excluir" onClick={onDelete} disabled={deleting}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

interface ProductRowProps {
  product: ProductWithCategory
  categories: Category[]
  onEdit: () => void
  onFicha: () => void
  onDuplicate: () => void
  onDelete: () => void
  onCyclePrep: () => void
  duplicating: boolean
  deleting: boolean
}

function ProductRow({ product: p, categories, onEdit, onFicha, onDuplicate, onDelete, onCyclePrep, duplicating, deleting }: ProductRowProps) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:shadow-sm transition-shadow">
      <div className="w-11 h-11 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center">
        {p.image_url
          ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
          : <UtensilsCrossed className="w-5 h-5 text-muted-foreground/40" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{p.name}</span>
          {p.categories && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${categoryColor(p.category_id, categories)}`}>
              {p.categories.name}
            </span>
          )}
          {!p.active && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
          <PrepStationButton station={p.prep_station} onCycle={onCyclePrep} />
        </div>
        <div className={cn('text-xs mt-0.5 flex items-center gap-1',
          p.stock_quantity <= 0 ? 'text-red-600' : p.stock_quantity <= 5 ? 'text-amber-600' : 'text-muted-foreground')}>
          {p.stock_quantity <= 0 ? <AlertTriangle className="w-3 h-3" /> : <Package className="w-3 h-3" />}
          {p.stock_quantity <= 0 ? 'Sem estoque' : `${p.stock_quantity} un`}
        </div>
      </div>
      <span className="font-bold text-green-600 shrink-0 tabular-nums">{formatCurrency(p.price)}</span>
      <div className="flex gap-1.5 shrink-0">
        <Button size="sm" variant="outline" title="Editar" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="outline" title="Ficha Técnica" onClick={onFicha}>
          <ClipboardList className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="outline" title="Duplicar produto" onClick={onDuplicate} disabled={duplicating}>
          <Copy className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" title="Excluir" onClick={onDelete} disabled={deleting}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}

type ViewMode = 'grid' | 'list'

export function ProdutosTab() {
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('produtos-view') as ViewMode) || 'grid')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [editProduct, setEditProduct] = useState<ProductWithCategory | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [fichaProduct, setFichaProduct] = useState<ProductWithCategory | null>(null)
  const [fichaOpen, setFichaOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name, id, description, image_url, sort_order, active, created_at)')
        .order('sort_order')
      if (error) throw error
      return data as ProductWithCategory[]
    },
  })

  const { data: categories = [] } = useQuery({
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
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })

  const prepMutation = useMutation({
    mutationFn: async ({ id, station }: { id: string; station: PrepStation }) => {
      const { error } = await supabase.from('products').update({ prep_station: station }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, station }) => {
      await queryClient.cancelQueries({ queryKey: ['products'] })
      const prev = queryClient.getQueryData<ProductWithCategory[]>(['products'])
      queryClient.setQueryData<ProductWithCategory[]>(['products'], (old) =>
        (old ?? []).map((p) => (p.id === id ? { ...p, prep_station: station } : p)))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['products'], ctx.prev)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })

  const handleDelete = (p: ProductWithCategory) => {
    if (!confirm(`Excluir o produto "${p.name}"? Esta ação não pode ser desfeita.`)) return
    deleteMutation.mutate(p.id)
  }

  const duplicateMutation = useMutation({
    mutationFn: async (p: ProductWithCategory) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, created_at, categories, ...rest } = p
      const { error } = await supabase.from('products').insert({
        ...rest,
        name: `${p.name} (cópia)`,
        stock_quantity: 0,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchCat = filterCategory === 'all' || p.category_id === filterCategory
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
      return matchCat && matchSearch
    })
  }, [products, filterCategory, search])

  const openEdit = (p: ProductWithCategory | null) => {
    setEditProduct(p)
    setEditOpen(true)
  }

  const openFicha = (p: ProductWithCategory) => {
    setFichaProduct(p)
    setFichaOpen(true)
  }

  const changeView = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('produtos-view', mode)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">Produtos</h2>
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
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="w-4 h-4 mr-1" />
            Importar
          </Button>
          <Button size="sm" onClick={() => openEdit(null)}>
            <Plus className="w-4 h-4 mr-1" />
            Novo Produto
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Todas as categorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {loadingProducts && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-44 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loadingProducts && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <UtensilsCrossed className="w-10 h-10 opacity-30" />
          <p className="text-sm">
            {search || filterCategory !== 'all'
              ? 'Nenhum produto encontrado com os filtros atuais.'
              : 'Nenhum produto cadastrado.'}
          </p>
          {!search && filterCategory === 'all' && (
            <Button size="sm" variant="outline" onClick={() => openEdit(null)}>
              <Plus className="w-4 h-4 mr-1" />
              Criar primeiro produto
            </Button>
          )}
        </div>
      )}

      {/* Grid */}
      {!loadingProducts && filtered.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              categories={categories}
              onEdit={() => openEdit(p)}
              onFicha={() => openFicha(p)}
              onDuplicate={() => duplicateMutation.mutate(p)}
              onDelete={() => handleDelete(p)}
              onCyclePrep={() => prepMutation.mutate({ id: p.id, station: nextPrepStation(p.prep_station) })}
              duplicating={duplicateMutation.isPending}
              deleting={deleteMutation.isPending}
              onImageUpdated={() => queryClient.invalidateQueries({ queryKey: ['products'] })}
            />
          ))}
        </div>
      )}

      {/* Lista */}
      {!loadingProducts && filtered.length > 0 && viewMode === 'list' && (
        <div className="space-y-2">
          {filtered.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              categories={categories}
              onEdit={() => openEdit(p)}
              onFicha={() => openFicha(p)}
              onDuplicate={() => duplicateMutation.mutate(p)}
              onDelete={() => handleDelete(p)}
              onCyclePrep={() => prepMutation.mutate({ id: p.id, station: nextPrepStation(p.prep_station) })}
              duplicating={duplicateMutation.isPending}
              deleting={deleteMutation.isPending}
            />
          ))}
        </div>
      )}

      <ProdutoFormModal
        open={editOpen}
        product={editProduct}
        onClose={() => { setEditOpen(false); setEditProduct(null) }}
        onSave={() => {}}
      />

      <FichaTecnicaModal
        open={fichaOpen}
        product={fichaProduct}
        onClose={() => { setFichaOpen(false); setFichaProduct(null) }}
      />

      <ImportXlsxModal
        open={importOpen}
        config={produtosImportConfig}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: ['products'] })
          queryClient.invalidateQueries({ queryKey: ['categories'] })
        }}
      />
    </div>
  )
}
