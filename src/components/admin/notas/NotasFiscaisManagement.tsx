import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  FileText, Printer, Clock, CheckCircle2, AlertCircle, Receipt, User, RotateCcw,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { EmitirNotaModal } from './EmitirNotaModal'
import type { Order, Invoice } from '@/types/database'

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function NotasFiscaisManagement() {
  const queryClient = useQueryClient()
  const [emitOrder, setEmitOrder] = useState<Order | null>(null)

  // Comandas fechadas (pagas)
  const { data: paidOrders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['paid-orders'],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders').select('*')
        .eq('status', 'paid')
        .order('closed_at', { ascending: false })
      return (data ?? []) as Order[]
    },
  })

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data } = await supabase.from('invoices').select('*').order('created_at', { ascending: false })
      return (data ?? []) as Invoice[]
    },
  })

  const invoiceByOrder = useMemo(() => {
    const m = new Map<string, Invoice>()
    for (const inv of invoices) {
      if (!inv.order_id) continue
      const cur = m.get(inv.order_id)
      // Prioriza autorizada; senão a mais recente
      if (!cur || inv.status === 'autorizado' || (cur.status !== 'autorizado' && inv.created_at > cur.created_at)) {
        m.set(inv.order_id, inv)
      }
    }
    return m
  }, [invoices])

  const pendentes = paidOrders.filter((o) => {
    const inv = invoiceByOrder.get(o.id)
    return !inv || inv.status === 'erro'
  })
  const emitidas = invoices.filter((i) => i.status === 'autorizado')
  const processando = invoices.filter((i) => i.status === 'processando')

  const reload = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    queryClient.invalidateQueries({ queryKey: ['paid-orders'] })
  }

  const orderById = useMemo(() => new Map(paidOrders.map((o) => [o.id, o])), [paidOrders])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Notas Fiscais</h2>
        <p className="text-muted-foreground text-sm mt-0.5">Emissão de NFC-e das comandas fechadas (Focus NFe)</p>
      </div>

      <Tabs defaultValue="pendentes">
        <TabsList>
          <TabsTrigger value="pendentes" className="gap-1.5">
            <Clock className="w-4 h-4" />Pendentes {pendentes.length > 0 && <Badge variant="secondary" className="ml-1">{pendentes.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="emitidas" className="gap-1.5">
            <CheckCircle2 className="w-4 h-4" />Emitidas {emitidas.length > 0 && <Badge variant="secondary" className="ml-1">{emitidas.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ── PENDENTES ── */}
        <TabsContent value="pendentes" className="mt-4 space-y-2">
          {loadingOrders && <div className="h-16 rounded-lg bg-muted animate-pulse" />}
          {!loadingOrders && pendentes.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <Receipt className="w-14 h-14 opacity-30" />
              <p>Nenhuma comanda pendente de nota</p>
            </div>
          )}
          {pendentes.map((o) => {
            const inv = invoiceByOrder.get(o.id)
            return (
              <div key={o.id} className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                  {o.table_number}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Comanda #{o.table_number}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {o.customer_name && <span className="flex items-center gap-1"><User className="w-3 h-3" />{o.customer_name}</span>}
                    {o.closed_at && <span>Fechada {fmtDateTime(o.closed_at)}</span>}
                    {inv?.status === 'erro' && (
                      <span className="flex items-center gap-1 text-destructive"><AlertCircle className="w-3 h-3" />Falha anterior</span>
                    )}
                  </div>
                </div>
                <span className="font-semibold shrink-0">{formatCurrency(Number(o.total))}</span>
                <Button size="sm" onClick={() => setEmitOrder(o)} className="shrink-0">
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  {inv?.status === 'erro' ? 'Reemitir' : 'Emitir Nota Fiscal'}
                </Button>
              </div>
            )
          })}

          {processando.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Processando</p>
              {processando.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 p-3 rounded-lg border bg-amber-50/50 text-sm">
                  <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                  <span className="flex-1">Ref {inv.ref}</span>
                  <span>{formatCurrency(Number(inv.amount))}</span>
                  <Button size="sm" variant="ghost" onClick={reload} title="Atualizar"><RotateCcw className="w-3.5 h-3.5" /></Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── EMITIDAS ── */}
        <TabsContent value="emitidas" className="mt-4 space-y-2">
          {emitidas.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <CheckCircle2 className="w-14 h-14 opacity-30" />
              <p>Nenhuma nota emitida</p>
            </div>
          )}
          {emitidas.map((inv) => {
            const o = inv.order_id ? orderById.get(inv.order_id) : null
            return (
              <div key={inv.id} className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow">
                <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    NFC-e {inv.numero ? `nº ${inv.numero}` : ''} {o ? `· Comanda #${o.table_number}` : ''}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {inv.customer_name && <span className="flex items-center gap-1"><User className="w-3 h-3" />{inv.customer_name}</span>}
                    <span>{fmtDateTime(inv.created_at)}</span>
                    <Badge variant="secondary" className="text-[10px]">{inv.environment === 'producao' ? 'Produção' : 'Homologação'}</Badge>
                  </div>
                </div>
                <span className="font-semibold shrink-0">{formatCurrency(Number(inv.amount))}</span>
                <Button
                  size="sm"
                  className="shrink-0"
                  disabled={!inv.danfe_url}
                  onClick={() => inv.danfe_url && window.open(inv.danfe_url, '_blank')}
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" />
                  Imprimir
                </Button>
              </div>
            )
          })}
        </TabsContent>
      </Tabs>

      <EmitirNotaModal
        open={!!emitOrder}
        order={emitOrder}
        onClose={() => setEmitOrder(null)}
        onEmitted={reload}
      />
    </div>
  )
}
