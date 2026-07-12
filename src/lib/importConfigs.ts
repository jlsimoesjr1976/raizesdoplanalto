import { supabase } from '@/integrations/supabase/client'
import type { ImportConfig } from '@/components/admin/ImportXlsxModal'
import type { ParsedRow } from '@/lib/xlsx'

// ── Helpers ─────────────────────────────────────────────────────────────────

function str(v: string | number | null): string | null {
  if (v === null) return null
  return String(v).trim() || null
}

function num(v: string | number | null): number {
  if (v === null) return 0
  return Number(v) || 0
}

function parseAtivo(v: string | number | null): boolean {
  if (v === null) return true
  const s = String(v).trim().toLowerCase()
  return !['não', 'nao', 'n', 'false', '0', 'inativo'].includes(s)
}

function onlyDigits(v: string | number | null): string {
  return v === null ? '' : String(v).replace(/\D/g, '')
}

function maskPhone(v: string | number | null): string {
  const d = onlyDigits(v).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function parseBirthday(v: string | number | null): string | null {
  const s = str(v)
  if (!s) return null
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return s
  return null
}

/** Marca duplicatas por telefone (dígitos) — para clientes */
async function flagDuplicatesByPhone(rows: ParsedRow[]): Promise<ParsedRow[]> {
  const { data } = await supabase.from('customers').select('phone')
  const existing = new Set(
    (data ?? []).map((r: { phone: string | null }) => onlyDigits(r.phone)).filter(Boolean)
  )
  const seen = new Set<string>()
  return rows.map((r) => {
    const digits = onlyDigits(r.values.phone)
    if (!digits) return r
    const errors = [...r.errors]
    if (existing.has(digits)) errors.push('Celular já cadastrado')
    else if (seen.has(digits)) errors.push('Celular duplicado na planilha')
    seen.add(digits)
    return { ...r, errors }
  })
}

/** Marca como erro as linhas cujo nome já existe (case-insensitive) */
async function flagDuplicates(rows: ParsedRow[], table: string): Promise<ParsedRow[]> {
  const { data } = await supabase.from(table).select('name')
  const existing = new Set((data ?? []).map((r: { name: string }) => r.name.toLowerCase()))

  const seenInFile = new Set<string>()
  return rows.map((r) => {
    const name = str(r.values.name)?.toLowerCase()
    if (!name) return r
    const errors = [...r.errors]
    if (existing.has(name)) errors.push('Já cadastrado no sistema')
    else if (seenInFile.has(name)) errors.push('Duplicado na planilha')
    seenInFile.add(name)
    return { ...r, errors }
  })
}

// ── Produtos ────────────────────────────────────────────────────────────────

export const produtosImportConfig: ImportConfig = {
  title: 'Importar Produtos',
  templateFileName: 'modelo-produtos.xlsx',
  sheetName: 'Produtos',
  columns: [
    { key: 'name', header: 'Nome *', required: true, type: 'text', example: 'Pão de Queijo (porção 6 un)', width: 30, hint: 'nome do produto como aparece no cardápio' },
    { key: 'category', header: 'Categoria', type: 'text', example: 'Entradas', width: 18, hint: 'nome da categoria; será criada automaticamente se não existir' },
    { key: 'description', header: 'Descrição', type: 'text', example: 'Tradicional pão de queijo mineiro, assado na hora', width: 42 },
    { key: 'price', header: 'Preço de Venda *', required: true, type: 'number', example: 24.9, width: 16, hint: 'em reais, ex: 24,90' },
    { key: 'cost_price', header: 'Preço de Custo', type: 'number', example: 8.5, width: 15, hint: 'em reais; deixe vazio se o produto for composto por insumos' },
    { key: 'stock_quantity', header: 'Estoque', type: 'number', example: 50, width: 10, hint: 'quantidade inicial em estoque' },
    { key: 'ncm', header: 'NCM', type: 'text', example: '1905.90.90', width: 12, hint: 'formato 0000.00.00' },
    { key: 'cest', header: 'CEST', type: 'text', example: '17.062.00', width: 11, hint: 'formato 00.000.00' },
    { key: 'cfop', header: 'CFOP', type: 'text', example: '5102', width: 8, hint: 'ex: 5101, 5102, 5405' },
    { key: 'csosn', header: 'CSOSN', type: 'text', example: '102', width: 8, hint: 'ex: 101, 102, 500' },
    { key: 'origem', header: 'Origem', type: 'number', example: 0, width: 8, hint: '0 a 8 (0 = Nacional)' },
    { key: 'active', header: 'Ativo', type: 'text', example: 'Sim', width: 8, hint: 'Sim ou Não (padrão: Sim)' },
  ],
  extraInstructions: [
    'CATEGORIAS: se a categoria informada não existir, ela será criada automaticamente.',
    'PRODUTOS COMPOSTOS POR INSUMOS: importe o produto normalmente e depois configure a composição pela tela de edição.',
    'PRODUTOS JÁ CADASTRADOS: linhas com nome já existente no sistema serão ignoradas.',
  ],
  prepareRows: (rows) => flagDuplicates(rows, 'products'),
  importRows: async (rows) => {
    // Resolve categorias por nome; cria as que não existem
    const { data: cats } = await supabase.from('categories').select('id, name')
    const catMap = new Map((cats ?? []).map((c) => [c.name.toLowerCase(), c.id]))

    const newCatNames = new Set<string>()
    for (const r of rows) {
      const cat = str(r.values.category)
      if (cat && !catMap.has(cat.toLowerCase())) newCatNames.add(cat)
    }
    if (newCatNames.size > 0) {
      const { data: created, error } = await supabase
        .from('categories')
        .insert([...newCatNames].map((name) => ({ name, active: true, sort_order: 99 })))
        .select('id, name')
      if (error) throw error
      for (const c of created ?? []) catMap.set(c.name.toLowerCase(), c.id)
    }

    const payload = rows.map((r) => {
      const cat = str(r.values.category)
      return {
        name: str(r.values.name)!,
        category_id: cat ? catMap.get(cat.toLowerCase()) ?? null : null,
        description: str(r.values.description),
        price: num(r.values.price),
        cost_price: num(r.values.cost_price),
        stock_quantity: num(r.values.stock_quantity),
        ncm: str(r.values.ncm),
        cest: str(r.values.cest),
        cfop: str(r.values.cfop),
        csosn: str(r.values.csosn),
        origem: r.values.origem !== null ? num(r.values.origem) : null,
        active: parseAtivo(r.values.active),
        has_ingredients: false,
        sort_order: 0,
      }
    })

    const { error } = await supabase.from('products').insert(payload)
    if (error) throw error
    return payload.length
  },
}

// ── Insumos ─────────────────────────────────────────────────────────────────

export const insumosImportConfig: ImportConfig = {
  title: 'Importar Insumos',
  templateFileName: 'modelo-insumos.xlsx',
  sheetName: 'Insumos',
  columns: [
    { key: 'name', header: 'Nome *', required: true, type: 'text', example: 'Queijo Minas Meia Cura', width: 28, hint: 'nome do insumo/ingrediente' },
    { key: 'unit', header: 'Unidade *', required: true, type: 'text', example: 'kg', width: 10, hint: 'kg, g, L, ml, un etc.' },
    { key: 'quantity', header: 'Quantidade em Estoque *', required: true, type: 'number', example: 5, width: 22, hint: 'quantidade atual, na unidade informada' },
    { key: 'min_quantity', header: 'Estoque Mínimo', type: 'number', example: 1, width: 16, hint: 'quando o estoque chegar neste nível, um alerta é exibido' },
    { key: 'cost', header: 'Custo Total (R$) *', required: true, type: 'number', example: 250, width: 16, hint: 'valor pago pela quantidade em estoque; o custo unitário é calculado automaticamente' },
  ],
  extraInstructions: [
    'CUSTO UNITÁRIO: calculado automaticamente (Custo Total ÷ Quantidade em Estoque).',
    'Exemplo da linha 2: 5 kg de queijo por R$ 250,00 → custo por kg = R$ 50,00.',
    'INSUMOS JÁ CADASTRADOS: linhas com nome já existente no sistema serão ignoradas.',
  ],
  prepareRows: (rows) => flagDuplicates(rows, 'ingredients'),
  importRows: async (rows) => {
    const payload = rows.map((r) => {
      const quantity = num(r.values.quantity)
      const cost = num(r.values.cost)
      return {
        name: str(r.values.name)!,
        unit: str(r.values.unit)!,
        quantity,
        min_quantity: num(r.values.min_quantity),
        cost,
        cost_per_unit: quantity > 0 ? cost / quantity : 0,
      }
    })

    const { error } = await supabase.from('ingredients').insert(payload)
    if (error) throw error
    return payload.length
  },
}

// ── Clientes ────────────────────────────────────────────────────────────────

export const clientesImportConfig: ImportConfig = {
  title: 'Importar Clientes',
  templateFileName: 'modelo-clientes.xlsx',
  sheetName: 'Clientes',
  columns: [
    { key: 'name', header: 'Nome *', required: true, type: 'text', example: 'João da Silva', width: 28, hint: 'nome completo do cliente' },
    { key: 'ddi', header: 'DDI', type: 'text', example: '+55', width: 8, hint: 'código do país; padrão +55 (Brasil)' },
    { key: 'phone', header: 'Celular', type: 'text', example: '(61) 99999-8888', width: 18, hint: 'com DDD; pode ter máscara ou só números' },
    { key: 'birthday', header: 'Data de Nascimento', type: 'text', example: '15/03/1990', width: 20, hint: 'formato DD/MM/AAAA' },
  ],
  extraInstructions: [
    'Os clientes importados ficam como NÃO verificados (sem validação por WhatsApp).',
    'Quando o DDI não for informado, será usado +55 (Brasil).',
    'A data de nascimento deve estar no formato DD/MM/AAAA (ex: 15/03/1990) — é opcional.',
    'CLIENTES JÁ CADASTRADOS: linhas com celular já existente no sistema serão ignoradas.',
  ],
  prepareRows: (rows) => flagDuplicatesByPhone(rows),
  importRows: async (rows) => {
    const payload = rows.map((r) => {
      let ddi = str(r.values.ddi) || '+55'
      if (!ddi.startsWith('+')) ddi = '+' + ddi.replace(/\D/g, '')
      const phoneMasked = maskPhone(r.values.phone)
      return {
        name: str(r.values.name)!,
        phone_ddi: ddi,
        phone: phoneMasked || null,
        phone_verified: false,
        birthday: parseBirthday(r.values.birthday),
      }
    })
    const { error } = await supabase.from('customers').insert(payload)
    if (error) throw error
    return payload.length
  },
}
