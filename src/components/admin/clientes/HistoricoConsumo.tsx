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

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))
}

function imprimirComanda(order: OrderWithItems, empresa: string) {
  const items = order.order_items ?? []
  const linhas = items.map((i) => `
    <tr>
      <td class="q">${i.quantity}x</td>
      <td class="d">${esc(i.product_name)}</td>
      <td class="v">${formatCurrency(i.unit_price * i.quantity)}</td>
    </tr>`).join('')

  // Layout para impressora térmica de 80mm (fonte monoespaçada)
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Comanda #${order.table_number}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      width: 80mm;
      padding: 3mm 4mm;
      color: #000;
      font-family: 'Courier New', 'Consolas', monospace;
      font-size: 12px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
    }
    .center { text-align: center; }
    h1 { font-size: 15px; font-weight: bold; margin: 0; text-align: center; text-transform: uppercase; }
    .sub { text-align: center; font-size: 11px; margin: 1mm 0 2mm; }
    .info { font-size: 11px; margin-bottom: 1mm; }
    .info div { display: flex; justify-content: space-between; gap: 6px; }
    .hr { border-top: 1px dashed #000; margin: 2mm 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    td { padding: 1px 0; vertical-align: top; }
    td.q { width: 8mm; }
    td.d { word-break: break-word; padding-right: 3px; }
    td.v { width: 20mm; text-align: right; white-space: nowrap; }
    .total { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-top: 1mm; }
    .foot { text-align: center; font-size: 10px; margin-top: 3mm; }
  </style></head><body>
    <h1>${esc(empresa)}</h1>
    <div class="sub">Comprovante de Consumo</div>
    <div class="hr"></div>
    <div class="info">
      <div><span>Comanda</span><span>#${order.table_number}</span></div>
      ${order.customer_name ? `<div><span>Cliente</span><span>${esc(order.customer_name)}</span></div>` : ''}
      <div><span>Fechada</span><span>${fmtDateTime(order.closed_at)}</span></div>
    </div>
    <div class="hr"></div>
    <table>${linhas}</table>
    <div class="hr"></div>
    <div class="total"><span>TOTAL</span><span>${formatCurrency(Number(order.total))}</span></div>
    <div class="foot">Documento sem valor fiscal</div>
  </body></html>`

  // Usa um iframe oculto (não depende de pop-up)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const cleanup = () => { try { document.body.removeChild(iframe) } catch { /* já removido */ } }

  iframe.onload = () => {
    const win = iframe.contentWindow
    if (!win) { cleanup(); return }
    setTimeout(() => {
      try { win.focus(); win.print() } catch { /* ignore */ }
      setTimeout(cleanup, 1500)
    }, 250)
  }

  const doc = iframe.contentWindow?.document
  if (doc) {
    doc.open()
    doc.write(html)
    doc.close()
  } else {
    cleanup()
  }
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
