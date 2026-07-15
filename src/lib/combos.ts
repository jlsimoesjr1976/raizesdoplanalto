import type { Combo, ComboItem, Product } from '@/types/database'

export type ComboWithItems = Combo & { combo_items: (ComboItem & { products: Product })[] }

/** Soma dos preços de venda dos produtos do combo (sem desconto). */
export function comboTotal(combo: ComboWithItems): number {
  return (combo.combo_items ?? []).reduce((s, i) => s + Number(i.products?.price ?? 0) * i.quantity, 0)
}

/**
 * Valor final do combo com o desconto aplicado.
 * Soma os preços unitários já arredondados a 2 casas — exatamente a mesma
 * conta do servidor (place-order) e da expansão em comanda, para o valor
 * exibido bater com o cobrado.
 */
export function comboFinal(combo: ComboWithItems): number {
  const factor = 1 - Number(combo.discount_percent) / 100
  return (combo.combo_items ?? []).reduce((s, i) => {
    const unit = Math.round(Number(i.products?.price ?? 0) * factor * 100) / 100
    return s + unit * i.quantity
  }, 0)
}

/** Quantos combos completos o estoque atual permite montar. */
export function comboMaxQty(combo: ComboWithItems): number {
  const items = combo.combo_items ?? []
  if (items.length === 0) return 0
  return Math.max(0, Math.min(...items.map((i) =>
    i.products && i.products.active ? Math.floor(Number(i.products.stock_quantity) / i.quantity) : 0
  )))
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
  return (combo.combo_items ?? [])
    .filter((i) => !!i.products)
    .map((i) => {
      const p = i.products as Product
      return {
        product: p,
        quantity: i.quantity * comboQty,
        unit_price: Math.round(Number(p.price) * factor * 100) / 100,
        display_name: `${p.name} (Combo: ${combo.name})`,
      }
    })
}
