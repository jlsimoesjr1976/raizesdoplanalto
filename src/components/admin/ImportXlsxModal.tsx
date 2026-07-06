import { useRef, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Download, FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, Loader2, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  downloadTemplate, parseXlsxFile,
  type ImportColumn, type ParsedRow,
} from '@/lib/xlsx'

export interface ImportConfig {
  /** Título do modal, ex: "Importar Produtos" */
  title: string
  /** Nome do arquivo modelo, ex: "modelo-produtos.xlsx" */
  templateFileName: string
  /** Nome da aba de dados na planilha */
  sheetName: string
  columns: ImportColumn[]
  /** Instruções extras na aba Instruções da planilha modelo */
  extraInstructions?: string[]
  /**
   * Valida/enriquece as linhas já parseadas (ex: detectar duplicatas no banco).
   * Pode adicionar erros diretamente em row.errors.
   */
  prepareRows?: (rows: ParsedRow[]) => Promise<ParsedRow[]>
  /** Insere as linhas válidas no banco. Retorna o total importado. */
  importRows: (rows: ParsedRow[]) => Promise<number>
}

interface Props {
  open: boolean
  onClose: () => void
  onImported: () => void
  config: ImportConfig
}

type Step = 'select' | 'preview' | 'done'

export function ImportXlsxModal({ open, onClose, onImported, config }: Props) {
  const [step, setStep] = useState<Step>('select')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const validRows = rows.filter((r) => r.errors.length === 0)
  const invalidRows = rows.filter((r) => r.errors.length > 0)

  function reset() {
    setStep('select')
    setRows([])
    setFileName('')
    setParseError('')
    setImporting(false)
    setImportedCount(0)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setParseError('')

    const { rows: parsed, error } = await parseXlsxFile(file, config.columns)
    if (error) {
      setParseError(error)
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    const prepared = config.prepareRows ? await config.prepareRows(parsed) : parsed
    setRows(prepared)
    setStep('preview')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleImport() {
    if (validRows.length === 0) return
    setImporting(true)
    try {
      const count = await config.importRows(validRows)
      setImportedCount(count)
      setStep('done')
      onImported()
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Erro ao importar dados.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            {config.title}
          </DialogTitle>
        </DialogHeader>

        {/* ── Passo 1: selecionar arquivo ── */}
        {step === 'select' && (
          <div className="space-y-4 py-2">
            {/* Baixar modelo */}
            <div className="rounded-lg border bg-muted/30 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium">1. Baixe a planilha modelo</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ela vem com um exemplo preenchido e uma aba de instruções.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  downloadTemplate(
                    config.templateFileName,
                    config.sheetName,
                    config.columns,
                    config.extraInstructions
                  )
                }
              >
                <Download className="w-4 h-4 mr-1.5" />
                Baixar modelo
              </Button>
            </div>

            {/* Upload */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">2. Envie a planilha preenchida</p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFile}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full h-32 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Upload className="w-6 h-6" />
                <span className="text-sm">Clique para selecionar o arquivo .xlsx</span>
                {fileName && <span className="text-xs opacity-60">{fileName}</span>}
              </button>
            </div>

            {parseError && (
              <p className="text-sm text-destructive flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {parseError}
              </p>
            )}
          </div>
        )}

        {/* ── Passo 2: prévia ── */}
        {step === 'preview' && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {validRows.length} linha{validRows.length !== 1 ? 's' : ''} válida{validRows.length !== 1 ? 's' : ''}
              </span>
              {invalidRows.length > 0 && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-800 text-xs font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {invalidRows.length} com erro (serão ignoradas)
                </span>
              )}
            </div>

            <ScrollArea className="flex-1 min-h-0 max-h-[45vh] border rounded-lg">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr className="text-left">
                    <th className="px-2 py-2 font-medium w-12">Linha</th>
                    {config.columns.map((c) => (
                      <th key={c.key} className="px-2 py-2 font-medium whitespace-nowrap">
                        {c.header}
                      </th>
                    ))}
                    <th className="px-2 py-2 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.line}
                      className={cn(
                        'border-t',
                        r.errors.length > 0 && 'bg-red-50/60'
                      )}
                    >
                      <td className="px-2 py-1.5 text-muted-foreground">{r.line}</td>
                      {config.columns.map((c) => (
                        <td key={c.key} className="px-2 py-1.5 whitespace-nowrap max-w-40 truncate">
                          {r.values[c.key] ?? <span className="text-muted-foreground/40">—</span>}
                        </td>
                      ))}
                      <td className="px-2 py-1.5">
                        {r.errors.length === 0 ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <span className="text-destructive text-[11px]">{r.errors.join('; ')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>

            {parseError && (
              <p className="text-sm text-destructive flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {parseError}
              </p>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={reset}>
                <X className="w-4 h-4 mr-1" />
                Escolher outro arquivo
              </Button>
              <Button onClick={handleImport} disabled={validRows.length === 0 || importing}>
                {importing ? (
                  <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Importando...</>
                ) : (
                  <>Importar {validRows.length} item{validRows.length !== 1 ? 'ns' : ''}</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Passo 3: concluído ── */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <CheckCircle2 className="w-14 h-14 text-green-500" />
            <p className="font-medium text-lg">
              {importedCount} item{importedCount !== 1 ? 'ns' : ''} importado{importedCount !== 1 ? 's' : ''}!
            </p>
            {invalidRows.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {invalidRows.length} linha{invalidRows.length !== 1 ? 's' : ''} com erro foi{invalidRows.length !== 1 ? 'ram' : ''} ignorada{invalidRows.length !== 1 ? 's' : ''}.
              </p>
            )}
            <Button className="mt-2" onClick={handleClose}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
