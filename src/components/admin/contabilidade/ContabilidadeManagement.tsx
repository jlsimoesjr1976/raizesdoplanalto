import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Scale, BookOpenText, ListTree, Target } from 'lucide-react'
import { BalanceteTab } from './BalanceteTab'
import { LancamentosTab } from './LancamentosTab'
import { PlanoContasTab } from './PlanoContasTab'
import { CentrosCustoTab } from './CentrosCustoTab'

export function ContabilidadeManagement() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contabilidade</h1>
        <p className="text-muted-foreground text-sm">
          Gestão contábil gerencial — não substitui a contabilidade oficial do contador.
        </p>
      </div>

      <Tabs defaultValue="balancete">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="balancete" className="gap-1.5">
            <Scale className="w-4 h-4" />
            Balancete
          </TabsTrigger>
          <TabsTrigger value="lancamentos" className="gap-1.5">
            <BookOpenText className="w-4 h-4" />
            Lançamentos
          </TabsTrigger>
          <TabsTrigger value="plano" className="gap-1.5">
            <ListTree className="w-4 h-4" />
            Plano de Contas
          </TabsTrigger>
          <TabsTrigger value="centros" className="gap-1.5">
            <Target className="w-4 h-4" />
            Centros de Custo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="balancete" className="mt-4"><BalanceteTab /></TabsContent>
        <TabsContent value="lancamentos" className="mt-4"><LancamentosTab /></TabsContent>
        <TabsContent value="plano" className="mt-4"><PlanoContasTab /></TabsContent>
        <TabsContent value="centros" className="mt-4"><CentrosCustoTab /></TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        Fase 1 do módulo. DRE Gerencial, Fluxo de Caixa, Indicadores, Balanço Patrimonial,
        Conciliação e Fechamento Mensal chegam nas próximas fases.
      </p>
    </div>
  )
}
