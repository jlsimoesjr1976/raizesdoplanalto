import { supabase } from '@/integrations/supabase/client'

// Cliente da Focus NFe (via Edge Function focus-nfe).
// A emissão de NFC-e depende dos dados fiscais (Configurações → Fiscal) e do
// cadastro fiscal de cada produto (NCM, CFOP, CSOSN, Origem).

export interface FocusResult {
  http_status?: number
  environment?: string
  base?: string
  data?: Record<string, unknown> | string
  error?: string
}

export interface EmitItem {
  descricao: string
  quantity: number
  unitPrice: number
  ncm?: string | null
  cfop?: string | null
  csosn?: string | null
  origem?: number | null
}

export interface EmitCompany {
  cnpj: string
}

export interface EmitData {
  cpf?: string
  nome?: string
  items: EmitItem[]
  total: number
}

function toMoney(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2)
}

function nowIso(): string {
  // ISO com fuso -03:00 (Brasília)
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}-03:00`
}

/** Monta o payload de NFC-e para a Focus NFe */
export function buildNfcePayload(company: EmitCompany, data: EmitData) {
  const items = data.items.map((it, i) => ({
    numero_item: String(i + 1),
    codigo_produto: String(i + 1),
    descricao: it.descricao,
    cfop: (it.cfop || '5102').replace(/\D/g, ''),
    codigo_ncm: (it.ncm || '00000000').replace(/\D/g, '').padEnd(8, '0').slice(0, 8),
    unidade_comercial: 'UN',
    quantidade_comercial: String(it.quantity),
    valor_unitario_comercial: toMoney(it.unitPrice),
    valor_bruto: toMoney(it.unitPrice * it.quantity),
    unidade_tributavel: 'UN',
    quantidade_tributavel: String(it.quantity),
    valor_unitario_tributavel: toMoney(it.unitPrice),
    icms_origem: String(it.origem ?? 0),
    icms_situacao_tributaria: it.csosn || '102',
  }))

  return {
    cnpj_emitente: company.cnpj.replace(/\D/g, ''),
    data_emissao: nowIso(),
    presenca_comprador: '1',
    modalidade_frete: '9',
    local_destino: '1',
    natureza_operacao: 'VENDA AO CONSUMIDOR',
    ...(data.cpf ? { cpf_destinatario: data.cpf.replace(/\D/g, '') } : {}),
    ...(data.nome ? { nome_destinatario: data.nome } : {}),
    items,
    formas_pagamento: [
      { forma_pagamento: '01', valor_pagamento: toMoney(data.total) },
    ],
  }
}

export async function emitirNfce(ref: string, payload: unknown): Promise<FocusResult> {
  const { data, error } = await supabase.functions.invoke('focus-nfe', {
    body: { action: 'emitir', ref, payload },
  })
  if (error) return { error: error.message }
  return data as FocusResult
}

export async function consultarNfce(ref: string): Promise<FocusResult> {
  const { data, error } = await supabase.functions.invoke('focus-nfe', {
    body: { action: 'consultar', ref },
  })
  if (error) return { error: error.message }
  return data as FocusResult
}
