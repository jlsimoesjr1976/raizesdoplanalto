import { lazy, Suspense } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Scale, BookOpenText, ListTree, Target, LineChart, Wallet, Gauge, Loader2 } from 'lucide-react'
import { BalanceteTab } from './BalanceteTab'
import { LancamentosTab } from './LancamentosTab'
import { PlanoContasTab } from './PlanoContasTab'
import { CentrosCustoTab } from './CentrosCustoTab'

// Telas com gráficos (recharts) carregam sob demanda
const DreTab = lazy(() => import('./DreTab').then((m) => ({ default: m.DreTab })))
const FluxoCaixaTab = lazy(() => import('./FluxoCaixaTab').then((m) => ({ default: m.FluxoCaixaTab })))
const IndicadoresTab = lazy(() => import('./IndicadoresTab').then((m) => ({ default: m.IndicadoresTab })))

function TabLoader() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
      <Loader2 className="w-4 h-4 animate-spin" />
      Carregando...
    </div>
  )
}

export function ContabilidadeManagement() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contabilidade</h1>
        <p className="text-muted-foreground text-sm">
          Gestão contábil gerencial — não substitui a contabilidade oficial do contador.
        </p>
      </div>

      <Tabs defaultValue="lancamentos">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="lancamentos" className="gap-1.5">
            <BookOpenText className="w-4 h-4" />
            Lançamentos
          </TabsTrigger>
          <TabsTrigger value="balancete" className="gap-1.5">
            <Scale className="w-4 h-4" />
            Balancete
          </TabsTrigger>
          <TabsTrigger value="dre" className="gap-1.5">
            <LineChart className="w-4 h-4" />
            DRE
          </TabsTrigger>
          <TabsTrigger value="fluxo" className="gap-1.5">
            <Wallet className="w-4 h-4" />
            Fluxo de Caixa
          </TabsTrigger>
          <TabsTrigger value="indicadores" className="gap-1.5">
            <Gauge className="w-4 h-4" />
            Indicadores
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

        <TabsContent value="lancamentos" className="mt-4"><LancamentosTab /></TabsContent>
        <TabsContent value="balancete" className="mt-4"><BalanceteTab /></TabsContent>
        <TabsContent value="dre" className="mt-4">
          <Suspense fallback={<TabLoader />}><DreTab /></Suspense>
        </TabsContent>
        <TabsContent value="fluxo" className="mt-4">
          <Suspense fallback={<TabLoader />}><FluxoCaixaTab /></Suspense>
        </TabsContent>
        <TabsContent value="indicadores" className="mt-4">
          <Suspense fallback={<TabLoader />}><IndicadoresTab /></Suspense>
        </TabsContent>
        <TabsContent value="plano" className="mt-4"><PlanoContasTab /></TabsContent>
        <TabsContent value="centros" className="mt-4"><CentrosCustoTab /></TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        Fase 2 do módulo. Balanço Patrimonial, Fechamento Mensal e Conciliação chegam na Fase 3.
      </p>
    </div>
  )
}
