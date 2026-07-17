// Busca endereço pelo CEP via ViaCEP (API pública gratuita, sem chave).
// https://viacep.com.br

export interface CepResult {
  cep: string
  street: string
  neighborhood: string
  city: string
  state: string
}

export async function lookupCep(cepRaw: string): Promise<{ ok: true; data: CepResult } | { ok: false; error: string }> {
  const cep = cepRaw.replace(/\D/g, '')
  if (cep.length !== 8) return { ok: false, error: 'CEP inválido. Digite os 8 números.' }
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
    if (!res.ok) return { ok: false, error: 'Não foi possível consultar o CEP agora. Tente novamente.' }
    const j = await res.json()
    if (j.erro) return { ok: false, error: 'CEP não encontrado.' }
    return {
      ok: true,
      data: {
        cep,
        street: j.logradouro ?? '',
        neighborhood: j.bairro ?? '',
        city: j.localidade ?? '',
        state: j.uf ?? '',
      },
    }
  } catch {
    return { ok: false, error: 'Não foi possível consultar o CEP. Verifique sua conexão.' }
  }
}

export function formatCep(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}
