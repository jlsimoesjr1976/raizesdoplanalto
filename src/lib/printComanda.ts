import { supabase } from '@/integrations/supabase/client'
import { formatCurrency } from './utils'

export interface PrintItem {
  quantity: number
  product_name: string
  unit_price: number
}

export interface PrintComandaData {
  numero: number | string
  cliente?: string | null
  data?: string | null   // data/hora (fechamento ou abertura)
  aberta?: boolean       // comanda ainda aberta
  items: PrintItem[]
  total: number
}

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))
}

function fmtDateTime(s?: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function getEmpresa(): Promise<string> {
  const { data } = await supabase.from('settings').select('key, value').in('key', ['nome_fantasia', 'razao_social', 'restaurant_name'])
  const m = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, String(r.value ?? '').replace(/^"|"$/g, '')]))
  return m.get('nome_fantasia') || m.get('razao_social') || m.get('restaurant_name') || 'Raízes do Planalto'
}

/** Imprime a comanda em layout de impressora térmica de 80mm */
export async function imprimirComanda(d: PrintComandaData) {
  const empresa = await getEmpresa()
  const linhas = d.items.map((i) => `
    <tr>
      <td class="q">${i.quantity}x</td>
      <td class="d">${esc(i.product_name)}</td>
      <td class="v">${formatCurrency(i.unit_price * i.quantity)}</td>
    </tr>`).join('')

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Comanda #${d.numero}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      width: 80mm; padding: 3mm 4mm; color: #000;
      font-family: 'Courier New', 'Consolas', monospace;
      font-size: 12px; line-height: 1.35; -webkit-print-color-adjust: exact;
    }
    h1 { font-size: 15px; font-weight: bold; margin: 0; text-align: center; text-transform: uppercase; }
    .sub { text-align: center; font-size: 11px; margin: 1mm 0 2mm; }
    .info { font-size: 11px; }
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
    <div class="sub">${d.aberta ? 'Comanda (em aberto)' : 'Comprovante de Consumo'}</div>
    <div class="hr"></div>
    <div class="info">
      <div><span>Comanda</span><span>#${d.numero}</span></div>
      ${d.cliente ? `<div><span>Cliente</span><span>${esc(d.cliente)}</span></div>` : ''}
      <div><span>${d.aberta ? 'Aberta' : 'Fechada'}</span><span>${fmtDateTime(d.data)}</span></div>
    </div>
    <div class="hr"></div>
    <table>${linhas}</table>
    <div class="hr"></div>
    <div class="total"><span>TOTAL</span><span>${formatCurrency(d.total)}</span></div>
    <div class="foot">Documento sem valor fiscal</div>
  </body></html>`

  printHtml(html)
}

/** Dispara a impressão de um HTML via iframe oculto (não depende de pop-up) */
function printHtml(html: string) {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
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
  if (doc) { doc.open(); doc.write(html); doc.close() } else { cleanup() }
}

export interface PrintPreparoItem {
  quantity: number
  product_name: string
  notes?: string | null
}

export interface PrintPreparoData {
  numero: number | string
  cliente?: string | null
  atendente?: string | null
  station: 'bar' | 'cozinha'
  items: PrintPreparoItem[]
}

/** Imprime o cupom da fila de preparo (Cozinha/Bar) em impressora térmica 80mm */
export async function imprimirPreparo(d: PrintPreparoData) {
  const empresa = await getEmpresa()
  const origem = d.station === 'bar' ? 'BAR' : 'COZINHA'
  const linhas = d.items.map((i) => `
    <tr>
      <td class="q">${i.quantity}x</td>
      <td class="d">${esc(i.product_name)}${i.notes ? `<div class="obs">↳ ${esc(i.notes)}</div>` : ''}</td>
    </tr>`).join('')

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Preparo #${d.numero}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      width: 80mm; padding: 3mm 4mm; color: #000;
      font-family: 'Courier New', 'Consolas', monospace;
      font-size: 13px; line-height: 1.4; -webkit-print-color-adjust: exact;
    }
    h1 { font-size: 14px; font-weight: bold; margin: 0; text-align: center; text-transform: uppercase; }
    .origem { text-align: center; font-size: 18px; font-weight: bold; margin: 1mm 0 2mm; letter-spacing: 1px; }
    .info { font-size: 12px; }
    .info div { display: flex; justify-content: space-between; gap: 6px; }
    .hr { border-top: 1px dashed #000; margin: 2mm 0; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    td { padding: 2px 0; vertical-align: top; }
    td.q { width: 9mm; font-weight: bold; }
    td.d { word-break: break-word; }
    .obs { font-size: 11px; font-style: italic; }
    .foot { text-align: center; font-size: 10px; margin-top: 3mm; }
  </style></head><body>
    <h1>${esc(empresa)}</h1>
    <div class="origem">${origem}</div>
    <div class="hr"></div>
    <div class="info">
      <div><span>Comanda</span><span>#${d.numero}</span></div>
      ${d.cliente ? `<div><span>Cliente</span><span>${esc(d.cliente)}</span></div>` : ''}
      ${d.atendente ? `<div><span>Atendente</span><span>${esc(d.atendente)}</span></div>` : ''}
      <div><span>Emitido</span><span>${fmtDateTime(new Date().toISOString())}</span></div>
    </div>
    <div class="hr"></div>
    <table>${linhas}</table>
    <div class="hr"></div>
    <div class="foot">Cupom de preparo — sem valor fiscal</div>
  </body></html>`

  printHtml(html)
}
