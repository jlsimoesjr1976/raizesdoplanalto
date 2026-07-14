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

/** Item removido da comanda */
export async function notifyItemRemovido(
  phoneRaw: string | null | undefined,
  numero: number | string,
  item: { name: string; quantity: number; unitPrice: number }
) {
  const d = digits(phoneRaw)
  if (!d) return
  const text = `❌ *Comanda #${numero}*\n\nItem removido: ${item.quantity}x ${item.name} — ${formatCurrency(item.unitPrice * item.quantity)}`
  await sendWhatsAppRaw(d, text)
}

/** Pedido começou a ser preparado (itens enviados à fila de preparo) */
export async function notifyPreparoIniciado(
  phoneRaw: string | null | undefined,
  name: string | null,
  numero: number | string,
  itens: { name: string; quantity: number }[]
) {
  const d = digits(phoneRaw)
  if (!d || itens.length === 0) return
  const linhas = itens.map((i) => `• ${i.quantity}x ${i.name}`).join('\n')
  const text = `👨‍🍳 *Comanda #${numero}*\n\nOlá, ${firstName(name)}! Seu pedido *começou a ser preparado*:\n${linhas}\n\nAvisaremos assim que estiver pronto. 😉`
  await sendWhatsAppRaw(d, text)
}

/** Pedido pronto — mensagem para o cliente */
export async function notifyPedidoProntoCliente(
  phoneRaw: string | null | undefined,
  name: string | null,
  numero: number | string,
  itens: { name: string; quantity: number }[]
) {
  const d = digits(phoneRaw)
  if (!d) return
  const linhas = itens.map((i) => `• ${i.quantity}x ${i.name}`).join('\n')
  const text = `🔔 *Comanda #${numero}*\n\n${firstName(name)}, seu pedido está *PRONTO*! ✅\n${linhas}\n\nBom apetite! 🍽️`
  await sendWhatsAppRaw(d, text)
}

/** Pedido pronto — aviso para o atendente responsável */
export async function notifyPedidoProntoAtendente(
  phoneRaw: string | null | undefined,
  atendenteName: string | null,
  numero: number | string,
  clienteName: string | null,
  station: 'bar' | 'cozinha',
  itens: { name: string; quantity: number }[]
) {
  const d = digits(phoneRaw)
  if (!d) return
  const linhas = itens.map((i) => `• ${i.quantity}x ${i.name}`).join('\n')
  const origem = station === 'bar' ? 'Bar' : 'Cozinha'
  const text = `🔔 *${origem} — Pedido pronto*\n\nOlá, ${firstName(atendenteName)}! O pedido da *comanda #${numero}*${clienteName ? ` (${clienteName})` : ''} está pronto para entrega:\n${linhas}`
  await sendWhatsAppRaw(d, text)
}

/** Pedido online — mudança de status de entrega */
export async function notifyPedidoStatus(
  phoneRaw: string | null | undefined,
  name: string | null,
  numero: number | string,
  status: 'preparando' | 'saiu_entrega' | 'entregue'
) {
  const d = digits(phoneRaw)
  if (!d) return
  const msgs: Record<typeof status, string> = {
    preparando: `👨‍🍳 *Pedido #${numero}*\n\n${firstName(name)}, seu pedido *começou a ser preparado*! Já já sai para entrega. 😉`,
    saiu_entrega: `🛵 *Pedido #${numero}*\n\n${firstName(name)}, seu pedido *saiu para entrega*! Logo chega até você. 🚀`,
    entregue: `✅ *Pedido #${numero}*\n\n${firstName(name)}, seu pedido foi *entregue*. Bom apetite e obrigado pela preferência! 💚`,
  }
  await sendWhatsAppRaw(d, msgs[status])
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
