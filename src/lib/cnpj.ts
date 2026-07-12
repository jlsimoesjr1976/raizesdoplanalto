// Consulta de CNPJ na base pública da Receita Federal via BrasilAPI
// https://brasilapi.com.br/docs#tag/CNPJ

export interface CnpjData {
  razao_social: string
  nome_fantasia: string
  situacao: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  municipio: string
  uf: string
  telefone: string
  cnae_codigo: string
  cnae_descricao: string
}

export function onlyDigits(v: string) {
  return v.replace(/\D/g, '')
}

export function applyCnpjMask(v: string) {
  const d = onlyDigits(v).slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export async function fetchCnpj(cnpj: string): Promise<{ ok: boolean; data?: CnpjData; error?: string }> {
  const digits = onlyDigits(cnpj)
  if (digits.length !== 14) return { ok: false, error: 'CNPJ deve ter 14 dígitos.' }

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
    if (res.status === 404) return { ok: false, error: 'CNPJ não encontrado na base da Receita.' }
    if (!res.ok) return { ok: false, error: `Erro ao consultar CNPJ (${res.status}).` }
    const j = await res.json()
    return {
      ok: true,
      data: {
        razao_social: j.razao_social ?? '',
        nome_fantasia: j.nome_fantasia ?? '',
        situacao: j.descricao_situacao_cadastral ?? '',
        cep: j.cep ? String(j.cep) : '',
        logradouro: j.logradouro ?? '',
        numero: j.numero ?? '',
        complemento: j.complemento ?? '',
        bairro: j.bairro ?? '',
        municipio: j.municipio ?? '',
        uf: j.uf ?? '',
        telefone: j.ddd_telefone_1 ?? '',
        cnae_codigo: j.cnae_fiscal ? String(j.cnae_fiscal) : '',
        cnae_descricao: j.cnae_fiscal_descricao ?? '',
      },
    }
  } catch {
    return { ok: false, error: 'Não foi possível consultar a Receita. Verifique a conexão.' }
  }
}
