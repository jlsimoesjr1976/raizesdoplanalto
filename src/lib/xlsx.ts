import * as XLSX from 'xlsx'

// ── Tipos ───────────────────────────────────────────────────────────────────

export interface ImportColumn {
  /** Chave interna da coluna */
  key: string
  /** Cabeçalho exibido na planilha */
  header: string
  required?: boolean
  type: 'text' | 'number'
  /** Valor de exemplo na linha modelo */
  example: string | number
  /** Largura da coluna na planilha (caracteres) */
  width?: number
  /** Instrução exibida na aba de instruções */
  hint?: string
}

export interface ParsedRow {
  /** Número da linha na planilha (1-based, contando o cabeçalho) */
  line: number
  values: Record<string, string | number | null>
  errors: string[]
}

// ── Geração de planilha modelo ──────────────────────────────────────────────

export function downloadTemplate(
  fileName: string,
  sheetName: string,
  columns: ImportColumn[],
  extraInstructions: string[] = []
) {
  const wb = XLSX.utils.book_new()

  // Aba principal: cabeçalho + linha de exemplo preenchida
  const headers = columns.map((c) => c.header)
  const example = columns.map((c) => c.example)
  const ws = XLSX.utils.aoa_to_sheet([headers, example])
  ws['!cols'] = columns.map((c) => ({ wch: c.width ?? Math.max(c.header.length + 2, 14) }))
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  // Aba de instruções
  const instructions: (string | number)[][] = [
    ['INSTRUÇÕES DE PREENCHIMENTO'],
    [''],
    ['1. Preencha os dados a partir da linha 2 da aba "' + sheetName + '".'],
    ['2. A linha 2 já vem com um EXEMPLO preenchido — substitua pelos seus dados.'],
    ['3. Não altere os nomes das colunas (linha 1).'],
    ['4. Campos marcados com * são obrigatórios.'],
    [''],
    ['COLUNAS:'],
    ...columns.map((c) => [
      `• ${c.header}${c.required ? ' (obrigatório)' : ' (opcional)'}: ${c.hint ?? (c.type === 'number' ? 'valor numérico' : 'texto')}`,
    ]),
    ...(extraInstructions.length ? [[''], ...extraInstructions.map((i) => [i])] : []),
  ]
  const wsInstr = XLSX.utils.aoa_to_sheet(instructions)
  wsInstr['!cols'] = [{ wch: 90 }]
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instruções')

  XLSX.writeFile(wb, fileName)
}

// ── Leitura e validação ─────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export async function parseXlsxFile(
  file: File,
  columns: ImportColumn[]
): Promise<{ rows: ParsedRow[]; error?: string }> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf)
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return { rows: [], error: 'Planilha vazia ou inválida.' }

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true })
  if (raw.length === 0) return { rows: [], error: 'Nenhuma linha de dados encontrada. Preencha a partir da linha 2.' }

  // Mapeia cabeçalhos da planilha → chaves das colunas (tolerante a acentos/caixa)
  const headerMap = new Map<string, string>() // normalized sheet header -> column key
  for (const col of columns) headerMap.set(normalizeHeader(col.header), col.key)

  const firstRow = raw[0]
  const sheetKeys = Object.keys(firstRow)
  const resolvedKeys = new Map<string, string>() // sheet key -> column key
  for (const sk of sheetKeys) {
    const colKey = headerMap.get(normalizeHeader(sk))
    if (colKey) resolvedKeys.set(sk, colKey)
  }

  // Verifica se as colunas obrigatórias existem na planilha
  const foundKeys = new Set(resolvedKeys.values())
  const missing = columns.filter((c) => c.required && !foundKeys.has(c.key))
  if (missing.length > 0) {
    return {
      rows: [],
      error: `Colunas obrigatórias não encontradas: ${missing.map((c) => c.header).join(', ')}. Use a planilha modelo.`,
    }
  }

  const rows: ParsedRow[] = raw.map((r, idx) => {
    const values: Record<string, string | number | null> = {}
    const errors: string[] = []

    for (const [sheetKey, colKey] of resolvedKeys) {
      const col = columns.find((c) => c.key === colKey)!
      let v = r[sheetKey]

      if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
        values[colKey] = null
        if (col.required) errors.push(`${col.header} é obrigatório`)
        continue
      }

      if (col.type === 'number') {
        if (typeof v === 'string') {
          // Aceita formato brasileiro: "1.234,56"
          v = v.replace(/\./g, '').replace(',', '.')
        }
        const n = Number(v)
        if (isNaN(n)) {
          errors.push(`${col.header} deve ser numérico`)
          values[colKey] = null
        } else {
          values[colKey] = n
        }
      } else {
        values[colKey] = String(v).trim()
      }
    }

    // Colunas ausentes na planilha ficam null
    for (const col of columns) {
      if (!(col.key in values)) values[col.key] = null
    }

    return { line: idx + 2, values, errors }
  })

  // Descarta linhas totalmente vazias
  const nonEmpty = rows.filter((r) => Object.values(r.values).some((v) => v !== null))

  return { rows: nonEmpty }
}
