import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HandCoins } from 'lucide-react'
import { ComissoesTab } from './ComissoesTab'

export function RelatoriosManagement() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground text-sm">Relatórios gerenciais do restaurante.</p>
      </div>

      <Tabs defaultValue="comissoes">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="comissoes" className="gap-1.5">
            <HandCoins className="w-4 h-4" />
            Comissões
          </TabsTrigger>
        </TabsList>

        <TabsContent value="comissoes" className="mt-4">
          <ComissoesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
