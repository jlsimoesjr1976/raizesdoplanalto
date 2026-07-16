// Exportação e impressão de relatórios contábeis (CSV, Excel, PDF).
// xlsx/jspdf são pesados: carregados sob demanda, fora do bundle inicial.

export interface ReportColumn {
  key: string
  header: string
  align?: 'left' | 'right'
}

export interface ReportData {
  title: string
  subtitle?: string
  columns: ReportColumn[]
  rows: Record<string, string | number>[]
  /** Linhas de totalização opcionais, exibidas em destaque no final */
  totals?: Record<string, string | number>
}

function cellText(v: string | number | undefined): string {
  if (v === undefined || v === null) return ''
  return String(v)
}

export function exportCsv(data: ReportData) {
  const sep = ';'
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = [
    data.columns.map((c) => esc(c.header)).join(sep),
    ...data.rows.map((r) => data.columns.map((c) => esc(cellText(r[c.key]))).join(sep)),
  ]
  if (data.totals) {
    lines.push(data.columns.map((c) => esc(cellText(data.totals![c.key]))).join(sep))
  }
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, `${slug(data.title)}.csv`)
}

export async function exportXlsx(data: ReportData) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const header = data.columns.map((c) => c.header)
  const rows = data.rows.map((r) => data.columns.map((c) => r[c.key] ?? ''))
  const aoa = [[data.title], data.subtitle ? [data.subtitle] : [], [], header, ...rows]
  if (data.totals) aoa.push(data.columns.map((c) => data.totals![c.key] ?? ''))
  const ws = XLSX.utils.aoa_to_sheet(aoa.filter((r) => r.length))
  ws['!cols'] = data.columns.map(() => ({ wch: 20 }))
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório')
  XLSX.writeFile(wb, `${slug(data.title)}.xlsx`)
}

export async function exportPdf(data: ReportData) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: data.columns.length > 6 ? 'landscape' : 'portrait' })
  const marginX = 12
  let y = 16
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(data.title, marginX, y)
  y += 6
  if (data.subtitle) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text(data.subtitle, marginX, y)
    doc.setTextColor(0)
    y += 6
  }
  y += 2

  const usableWidth = pageWidth - marginX * 2
  const colWidth = usableWidth / data.columns.length
  const rowH = 5.5

  function drawHeader() {
    doc.setFillColor(240, 240, 240)
    doc.rect(marginX, y - 4, usableWidth, rowH, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    data.columns.forEach((c, i) => {
      const x = marginX + i * colWidth + (c.align === 'right' ? colWidth - 1 : 1)
      doc.text(c.header, x, y, { align: c.align === 'right' ? 'right' : 'left', maxWidth: colWidth - 2 })
    })
    y += rowH
    doc.setFont('helvetica', 'normal')
  }

  drawHeader()
  for (const row of data.rows) {
    if (y > pageHeight - 16) {
      doc.addPage()
      y = 16
      drawHeader()
    }
    doc.setFontSize(8)
    data.columns.forEach((c, i) => {
      const x = marginX + i * colWidth + (c.align === 'right' ? colWidth - 1 : 1)
      doc.text(cellText(row[c.key]), x, y, { align: c.align === 'right' ? 'right' : 'left', maxWidth: colWidth - 2 })
    })
    y += rowH
  }

  if (data.totals) {
    doc.setDrawColor(180)
    doc.line(marginX, y - 3.5, marginX + usableWidth, y - 3.5)
    doc.setFont('helvetica', 'bold')
    data.columns.forEach((c, i) => {
      const x = marginX + i * colWidth + (c.align === 'right' ? colWidth - 1 : 1)
      doc.text(cellText(data.totals![c.key]), x, y, { align: c.align === 'right' ? 'right' : 'left', maxWidth: colWidth - 2 })
    })
  }

  doc.setFontSize(7)
  doc.setTextColor(140)
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} — Relatório gerencial, não substitui a contabilidade oficial.`, marginX, pageHeight - 8)

  doc.save(`${slug(data.title)}.pdf`)
}

export function printReport(data: ReportData) {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  const rowsHtml = data.rows.map((r) =>
    `<tr>${data.columns.map((c) => `<td class="${c.align === 'right' ? 'r' : ''}">${cellText(r[c.key])}</td>`).join('')}</tr>`
  ).join('')
  const totalsHtml = data.totals
    ? `<tr class="tot">${data.columns.map((c) => `<td class="${c.align === 'right' ? 'r' : ''}">${cellText(data.totals![c.key])}</td>`).join('')}</tr>`
    : ''
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${data.title}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:24px;color:#111}
      h1{font-size:16px;margin:0 0 2px}
      p.sub{font-size:11px;color:#666;margin:0 0 14px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{padding:5px 8px;border-bottom:1px solid #ddd;text-align:left}
      th{background:#f3f3f3}
      td.r,th.r{text-align:right}
      tr.tot td{font-weight:bold;border-top:2px solid #333}
      footer{margin-top:16px;font-size:9px;color:#999}
      @media print{ body{padding:0} }
    </style></head><body>
    <h1>${data.title}</h1>
    ${data.subtitle ? `<p class="sub">${data.subtitle}</p>` : ''}
    <table><thead><tr>${data.columns.map((c) => `<th class="${c.align === 'right' ? 'r' : ''}">${c.header}</th>`).join('')}</tr></thead>
    <tbody>${rowsHtml}${totalsHtml}</tbody></table>
    <footer>Gerado em ${new Date().toLocaleString('pt-BR')} — Relatório gerencial, não substitui a contabilidade oficial.</footer>
    <script>window.onload=()=>window.print()</script>
    </body></html>`)
  win.document.close()
}

function slug(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
