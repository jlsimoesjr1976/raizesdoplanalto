import { lazy, Suspense } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Scale, BookOpenText, ListTree, Target, LineChart, Wallet, Gauge, Loader2, Landmark, Lock, GitCompareArrows } from 'lucide-react'
import { FechamentoTab } from './FechamentoTab'
import { ConciliacaoTab } from './ConciliacaoTab'
import { BalanceteTab } from './BalanceteTab'
import { LancamentosTab } from './LancamentosTab'
import { PlanoContasTab } from './PlanoContasTab'
import { CentrosCustoTab } from './CentrosCustoTab'

// Telas com gráficos (recharts) carregam sob demanda
const DreTab = lazy(() => import('./DreTab').then((m) => ({ default: m.DreTab })))
const FluxoCaixaTab = lazy(() => import('./FluxoCaixaTab').then((m) => ({ default: m.FluxoCaixaTab })))
const IndicadoresTab = lazy(() => import('./IndicadoresTab').then((m) => ({ default: m.IndicadoresTab })))
const BalancoTab = lazy(() => import('./BalancoTab').then((m) => ({ default: m.BalancoTab })))

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
          <TabsTrigger value="balanco" className="gap-1.5">
            <Landmark className="w-4 h-4" />
            Balanço
          </TabsTrigger>
          <TabsTrigger value="conciliacao" className="gap-1.5">
            <GitCompareArrows className="w-4 h-4" />
            Conciliação
          </TabsTrigger>
          <TabsTrigger value="fechamento" className="gap-1.5">
            <Lock className="w-4 h-4" />
            Fechamento
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
        <TabsContent value="balanco" className="mt-4">
          <Suspense fallback={<TabLoader />}><BalancoTab /></Suspense>
        </TabsContent>
        <TabsContent value="conciliacao" className="mt-4"><ConciliacaoTab /></TabsContent>
        <TabsContent value="fechamento" className="mt-4"><FechamentoTab /></TabsContent>
        <TabsContent value="plano" className="mt-4"><PlanoContasTab /></TabsContent>
        <TabsContent value="centros" className="mt-4"><CentrosCustoTab /></TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        Módulo gerencial completo (Fases 1–3). Orçamento, metas e exportações avançadas chegam na Fase 4.
      </p>
    </div>
  )
}
