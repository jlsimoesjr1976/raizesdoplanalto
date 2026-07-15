import type { Combo, ComboItem, Product } from '@/types/database'

export type ComboWithItems = Combo & { combo_items: (ComboItem & { products: Product })[] }

/** Soma dos preços de venda dos produtos do combo (sem desconto). */
export function comboTotal(combo: ComboWithItems): number {
  return (combo.combo_items ?? []).reduce((s, i) => s + Number(i.products?.price ?? 0) * i.quantity, 0)
}

/** Valor final do combo com o desconto aplicado. */
export function comboFinal(combo: ComboWithItems): number {
  return comboTotal(combo) * (1 - Number(combo.discount_percent) / 100)
}

/** Combo disponível para venda: todos os produtos ativos e com estoque suficiente para 1 combo. */
export function comboAvailable(combo: ComboWithItems): boolean {
  const items = combo.combo_items ?? []
  if (items.length === 0) return false
  return items.every((i) => i.products && i.products.active && Number(i.products.stock_quantity) >= i.quantity)
}

/**
 * Expande um combo em linhas de item de pedido: cada produto vai à sua fila
 * de preparo e baixa seu próprio estoque, com o desconto do combo aplicado
 * no preço unitário.
 */
export function expandCombo(combo: ComboWithItems, comboQty: number) {
  const factor = 1 - Number(combo.discount_percent) / 100
  return (combo.combo_items ?? []).map((i) => ({
    product: i.products,
    quantity: i.quantity * comboQty,
    unit_price: Math.round(Number(i.products.price) * factor * 100) / 100,
    display_name: `${i.products.name} (Combo: ${combo.name})`,
  }))
}
