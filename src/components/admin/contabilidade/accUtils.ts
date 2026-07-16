import type { AccAccount, AccKind, AccNature } from '@/types/database'

export const KIND_LABELS: Record<AccKind, string> = {
  ativo: 'Ativo',
  passivo: 'Passivo',
  pl: 'Patrimônio Líquido',
  receita: 'Receita',
  custo: 'Custo',
  despesa: 'Despesa',
  compensatoria: 'Compensatória',
}

export const KIND_COLORS: Record<AccKind, string> = {
  ativo: 'bg-blue-100 text-blue-800',
  passivo: 'bg-orange-100 text-orange-800',
  pl: 'bg-purple-100 text-purple-800',
  receita: 'bg-green-100 text-green-800',
  custo: 'bg-red-100 text-red-800',
  despesa: 'bg-amber-100 text-amber-800',
  compensatoria: 'bg-gray-100 text-gray-700',
}

/** Ordenação natural por código contábil (1.2.10 depois de 1.2.9) */
export function compareCode(a: string, b: string): number {
  const as = a.split('.').map(Number)
  const bs = b.split('.').map(Number)
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const x = as[i] ?? -1
    const y = bs[i] ?? -1
    if (x !== y) return x - y
  }
  return 0
}

export function sortAccounts(accounts: AccAccount[]): AccAccount[] {
  return [...accounts].sort((a, b) => compareCode(a.code, b.code))
}

/** Saldo com sinal segundo a natureza da conta (positivo = saldo "normal") */
export function signedBalance(nature: AccNature, debits: number, credits: number): number {
  return nature === 'D' ? debits - credits : credits - debits
}

/** Natureza efetiva de um saldo (D/C) considerando a natureza da conta */
export function balanceNature(nature: AccNature, balance: number): AccNature {
  if (balance === 0) return nature
  if (balance > 0) return nature
  return nature === 'D' ? 'C' : 'D'
}

export const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const last = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { from, to }
}
