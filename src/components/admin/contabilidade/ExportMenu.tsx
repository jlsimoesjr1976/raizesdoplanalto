import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Download, Printer, FileSpreadsheet, FileText, FileDown, Loader2 } from 'lucide-react'
import { exportCsv, exportXlsx, exportPdf, printReport, type ReportData } from './reportExport'

export function ExportMenu({ getData }: { getData: () => ReportData }) {
  const [busy, setBusy] = useState<string | null>(null)

  async function run(kind: string, fn: () => void | Promise<void>) {
    setBusy(kind)
    try {
      await fn()
    } catch (e) {
      alert(`Erro ao exportar: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => run('pdf', () => exportPdf(getData()))}>
          <FileText className="w-4 h-4 mr-2" /> PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run('xlsx', () => exportXlsx(getData()))}>
          <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run('csv', () => exportCsv(getData()))}>
          <FileDown className="w-4 h-4 mr-2" /> CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run('print', () => printReport(getData()))}>
          <Printer className="w-4 h-4 mr-2" /> Imprimir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
