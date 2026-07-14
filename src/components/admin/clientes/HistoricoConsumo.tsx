import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Printer, ChevronDown, ChevronUp, Receipt, CalendarDays, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Order, OrderItem } from '@/types/database'

interface OrderWithItems extends Order {
  order_items?: OrderItem[]
}

function fmtDateTime(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function imprimirComanda(order: OrderWithItems, empresa: string) {
  const items = order.order_items ?? []
  const linhas = items.map((i) => `
    <tr>
      <td>${i.quantity}x</td>
      <td>${i.product_name}</td>
      <td style="text-align:right">${formatCurrency(i.unit_price * i.quantity)}</td>
    </tr>`).join('')

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Comanda #${order.table_number}</title>
  <style>
    * { font-family: -apple-system, Arial, sans-serif; }
    body { max-width: 360px; margin: 0 auto; padding: 16px; color: #111; }
    h1 { font-size: 16px; text-align: center; margin: 0 0 2px; }
    .sub { text-align:center; color:#666; font-size:12px; margin-bottom:12px; }
    .info { font-size: 12px; color:#333; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    td { padding: 3px 0; vertical-align: top; }
    .total { border-top: 1px dashed #999; margin-top: 8px; padding-top: 8px; display:flex; justify-content:space-between; font-weight:bold; font-size:14px; }
    .foot { text-align:center; color:#888; font-size:11px; margin-top:16px; }
  </style></head><body>
    <h1>${empresa}</h1>
    <div class="sub">Comprovante de Consumo</div>
    <div class="info">
      <div><b>Comanda:</b> #${order.table_number}</div>
      ${order.customer_name ? `<div><b>Cliente:</b> ${order.customer_name}</div>` : ''}
      <div><b>Fechada em:</b> ${fmtDateTime(order.closed_at)}</div>
    </div>
    <table>${linhas}</table>
    <div class="total"><span>Total</span><span>${formatCurrency(Number(order.total))}</span></div>
    <div class="foot">Documento sem valor fiscal</div>
    <script>window.onload = () => { window.print(); }</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=420,height=640')
  if (w) { w.document.write(html); w.document.close() }
}

export function HistoricoConsumo({ customerId }: { customerId: string }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: empresa = 'Raízes do Planalto' } = useQuery({
    queryKey: ['empresa-nome'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('key, value').in('key', ['nome_fantasia', 'razao_social', 'restaurant_name'])
      const map = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, String(r.value ?? '').replace(/^"|"$/g, '')]))
      return map.get('nome_fantasia') || map.get('razao_social') || map.get('restaurant_name') || 'Raízes do Planalto'
    },
  })

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['customer-history', customerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('customer_id', customerId)
        .eq('status', 'paid')
        .order('closed_at', { ascending: false })
      return (data ?? []) as OrderWithItems[]
    },
  })

  const total = orders.reduce((s, o) => s + Number(o.total), 0)

  if (isLoading) {
    return <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
        <Receipt className="w-12 h-12 opacity-30" />
        <p className="text-sm">Nenhuma comanda fechada para este cliente</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 py-1">
      <div className="flex items-center justify-between text-sm px-1">
        <span className="text-muted-foreground">{orders.length} comanda{orders.length !== 1 ? 's' : ''}</span>
        <span className="font-semibold">Total: {formatCurrency(total)}</span>
      </div>

      <div className="space-y-2 max-h-[55vh] overflow-y-auto">
        {orders.map((o) => {
          const isOpen = expanded === o.id
          const items = o.order_items ?? []
          return (
            <div key={o.id} className="rounded-lg border bg-card">
              <div className="flex items-center gap-3 p-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                  {o.table_number}
                </div>
                <button className="flex-1 min-w-0 text-left" onClick={() => setExpanded(isOpen ? null : o.id)}>
                  <p className="font-medium text-sm">Comanda #{o.table_number}</p>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="w-3 h-3" />{fmtDateTime(o.closed_at)} · {items.length} ite{items.length !== 1 ? 'ns' : 'm'}
                  </span>
                </button>
                <span className="font-semibold text-sm shrink-0">{formatCurrency(Number(o.total))}</span>
                <Button size="sm" variant="outline" title="Imprimir" onClick={() => imprimirComanda(o, empresa)}>
                  <Printer className="w-3.5 h-3.5" />
                </Button>
                <button onClick={() => setExpanded(isOpen ? null : o.id)} className="text-muted-foreground">
                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {isOpen && (
                <div className="px-3 pb-3 pt-0 border-t mt-0">
                  <table className="w-full text-xs mt-2">
                    <tbody>
                      {items.map((i) => (
                        <tr key={i.id} className="border-b last:border-0">
                          <td className="py-1.5 pr-2 font-medium w-8">{i.quantity}x</td>
                          <td className="py-1.5 pr-2">{i.product_name}</td>
                          <td className="py-1.5 text-right font-medium">{formatCurrency(i.unit_price * i.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
