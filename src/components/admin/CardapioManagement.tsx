import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CategoriasTab } from './CategoriasTab'
import { ProdutosTab } from './ProdutosTab'
import { Tag, UtensilsCrossed } from 'lucide-react'

export function CardapioManagement() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cardápio</h1>
        <p className="text-muted-foreground text-sm">
          Gerencie categorias e produtos do seu cardápio.
        </p>
      </div>

      <Tabs defaultValue="categorias">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="categorias" className="flex-1 sm:flex-none gap-1.5">
            <Tag className="w-4 h-4" />
            Categorias
          </TabsTrigger>
          <TabsTrigger value="produtos" className="flex-1 sm:flex-none gap-1.5">
            <UtensilsCrossed className="w-4 h-4" />
            Produtos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categorias" className="mt-4">
          <CategoriasTab />
        </TabsContent>

        <TabsContent value="produtos" className="mt-4">
          <ProdutosTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
