import { sendWhatsAppRaw } from './evolution'
import { formatCurrency } from './utils'

// Notificações de comanda para o WhatsApp do cliente (best-effort).
// O número deve incluir o DDI (ex.: "+55 (61) 99999-8888" → 5561999998888).

function digits(phoneRaw?: string | null): string {
  return (phoneRaw ?? '').replace(/\D/g, '')
}

function firstName(name?: string | null): string {
  return (name ?? '').trim().split(' ')[0] || 'Cliente'
}

/** Comanda aberta */
export async function notifyComandaAberta(phoneRaw: string | null | undefined, name: string | null, numero: number | string) {
  const d = digits(phoneRaw)
  if (!d) return
  const text = `Olá, ${firstName(name)}! 🍽️\n\nSua *comanda #${numero}* foi aberta no Raízes do Planalto. Bom apetite! 🍺`
  await sendWhatsAppRaw(d, text)
}

/** Itens lançados na comanda */
export async function notifyItensLancados(
  phoneRaw: string | null | undefined,
  numero: number | string,
  itens: { name: string; quantity: number; unitPrice: number }[]
) {
  const d = digits(phoneRaw)
  if (!d || itens.length === 0) return
  const linhas = itens.map((i) => `• ${i.quantity}x ${i.name} — ${formatCurrency(i.unitPrice * i.quantity)}`).join('\n')
  const total = itens.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const plural = itens.length > 1 || itens.some((i) => i.quantity > 1)
  const text = `🧾 *Comanda #${numero}*\n\n${plural ? 'Itens lançados' : 'Item lançado'}:\n${linhas}\n\nSubtotal desta rodada: *${formatCurrency(total)}*`
  await sendWhatsAppRaw(d, text)
}

/** Pagamento efetuado / comanda fechada */
export async function notifyPagamento(
  phoneRaw: string | null | undefined,
  name: string | null,
  numero: number | string,
  formas: { label: string; amount: number }[],
  totalPago: number
) {
  const d = digits(phoneRaw)
  if (!d) return
  const linhas = formas.filter((f) => f.amount > 0).map((f) => `• ${f.label}: ${formatCurrency(f.amount)}`).join('\n')
  const text = `✅ *Pagamento recebido!*\n\nComanda *#${numero}*\n${linhas}\n\nTotal pago: *${formatCurrency(totalPago)}*\n\nSua comanda foi *fechada*. Obrigado pela preferência, ${firstName(name)}! 💚`
  await sendWhatsAppRaw(d, text)
}
