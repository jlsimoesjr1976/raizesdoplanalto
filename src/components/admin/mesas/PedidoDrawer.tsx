import { useState, useEffect, useCallback } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Plus, Trash2, Clock, ChefHat, CheckCircle2, Truck,
  Users, UserCheck, Receipt, CircleDollarSign, Pencil, Check, User, Phone, Printer,
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { AdicionarItemModal } from './AdicionarItemModal'
import { FecharContaModal } from './FecharContaModal'
import { notifyItensLancados, notifyItemRemovido, notifyPreparoIniciado } from '@/lib/comandaNotify'
import { imprimirComanda } from '@/lib/printComanda'
import type { Order, OrderItem, PrepStation } from '@/types/database'

const KITCHEN_STATUS_CONFIG = {
  pending:    { label: 'Aguardando', icon: Clock,        color: 'bg-gray-100 text-gray-700' },
  preparing:  { label: 'Preparando', icon: ChefHat,      color: 'bg-amber-100 text-amber-700' },
  ready:      { label: 'Pronto',     icon: CheckCircle2, color: 'bg-green-100 text-green-700' },
  delivered:  { label: 'Entregue',   icon: Truck,        color: 'bg-blue-100 text-blue-700' },
}

interface Props {
  open: boolean
  onClose: () => void
  orderId: string | null
  onUpdated: () => void
}

export function PedidoDrawer({ open, onClose, orderId, onUpdated }: Props) {
  const { role } = useAuth()
  const podeExcluirItem = role !== 'atendente'
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showFechar, setShowFechar] = useState(false)
  const [editingPeople, setEditingPeople] = useState(false)
  const [peopleInput, setPeopleInput] = useState('')
  const [liberando, setLiberando] = useState(false)

  const loadOrder = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, profiles(*), order_items(*)')
      .eq('id', orderId)
      .single()
    setOrder(data as Order | null)
    setLoading(false)
  }, [orderId])

  useEffect(() => {
    if (open && orderId) loadOrder()
  }, [open, orderId, loadOrder])

  // Realtime — atualiza itens automaticamente
  useEffect(() => {
    if (!open || !orderId) return
    const channel = supabase
      .channel(`order-${orderId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'order_items',
        filter: `order_id=eq.${orderId}`,
      }, () => loadOrder())
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      }, () => loadOrder())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [open, orderId, loadOrder])

  async function handleAddItems(items: { product: { id: string; name: string; price: number; prep_station?: PrepStation }; quantity: number; notes: string }[]) {
    if (!orderId) return
    const rows = items.map((i) => ({
      order_id: orderId,
      product_id: i.product.id,
      product_name: i.product.name,
      quantity: i.quantity,
      unit_price: i.product.price,
      notes: i.notes || null,
      prep_station: i.product.prep_station ?? null,
    }))
    await supabase.from('order_items').insert(rows)

    // Baixa do estoque (todos os itens lançados, independente da fila de preparo)
    await Promise.all(items.map((i) =>
      supabase.rpc('adjust_product_stock', { p_product_id: i.product.id, p_delta: -i.quantity })
    ))

    // Notifica o cliente pelo WhatsApp (itens lançados)
    if (order?.customer_phone) {
      notifyItensLancados(order.customer_phone, order.table_number ?? '', items.map((i) => ({
        name: i.product.name,
        quantity: i.quantity,
        unitPrice: i.product.price,
      })))

      // Se algum item vai para uma fila de preparo, avisa que o pedido começou a ser preparado
      const emPreparo = items.filter((i) => i.product.prep_station === 'bar' || i.product.prep_station === 'cozinha')
      if (emPreparo.length > 0) {
        notifyPreparoIniciado(order.customer_phone, order.customer_name, order.table_number ?? '', emPreparo.map((i) => ({
          name: i.product.name,
          quantity: i.quantity,
        })))
      }
    }

    await loadOrder()
  }

  async function handleRemoveItem(item: OrderItem) {
    const devolver = window.confirm(
      `Excluir ${item.quantity}x ${item.product_name}.\n\nDeseja devolver este item ao estoque?\n\nOK = devolver ao estoque\nCancelar = não devolver`
    )

    await supabase.from('order_items').delete().eq('id', item.id)

    // Devolve ao estoque se o usuário confirmou
    if (devolver && item.product_id) {
      await supabase.rpc('adjust_product_stock', { p_product_id: item.product_id, p_delta: item.quantity })
    }

    // Notifica o cliente pelo WhatsApp (item removido)
    if (order?.customer_phone) {
      notifyItemRemovido(order.customer_phone, order.table_number ?? '', {
        name: item.product_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
      })
    }

    await loadOrder()
  }

  function handlePrint() {
    if (!order) return
    const items = (order.order_items ?? []).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    imprimirComanda({
      numero: order.table_number ?? '',
      cliente: order.customer_name,
      data: order.status === 'open' ? order.created_at : order.closed_at,
      aberta: order.status === 'open',
      items: items.map((i) => ({ quantity: i.quantity, product_name: i.product_name, unit_price: i.unit_price })),
      total: Number(order.total),
    })
  }

  // Sem consumo (total 0,00): encerra a comanda e libera a mesa diretamente
  async function handleLiberarMesa() {
    if (!order) return
    if (!confirm(`Liberar a Comanda ${order.table_number}? Será encerrada sem consumo.`)) return
    setLiberando(true)
    await supabase
      .from('orders')
      .update({ status: 'cancelled', closed_at: new Date().toISOString() })
      .eq('id', order.id)
    if (order.table_id) {
      await supabase.from('tables').update({ status: 'free' }).eq('id', order.table_id)
    }
    setLiberando(false)
    onUpdated()
    onClose()
  }

  async function savePeopleCount() {
    const count = parseInt(peopleInput)
    if (!order || isNaN(count) || count < 1) { setEditingPeople(false); return }
    await supabase.from('orders').update({ people_count: count }).eq('id', order.id)
    await loadOrder()
    setEditingPeople(false)
  }

  function startEditPeople() {
    setPeopleInput(String(order?.people_count ?? 1))
    setEditingPeople(true)
  }

  const items: OrderItem[] = (order?.order_items ?? []).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  const total = order?.total ?? 0
  const people = order?.people_count ?? 1

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg">
                Comanda {order?.table_number ?? '—'}
                {(order as Order & { tables?: { name?: string } })?.tables?.name
                  ? ` — ${(order as Order & { tables?: { name?: string } })?.tables?.name}`
                  : ''}
              </SheetTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  title="Imprimir comanda"
                  onClick={handlePrint}
                  disabled={!order || (order.order_items?.length ?? 0) === 0}
                >
                  <Printer className="w-3.5 h-3.5" />
                </Button>
                <Badge variant="outline" className="text-xs">
                  {order?.status === 'open' ? 'Aberta' : order?.status === 'paid' ? 'Paga' : 'Cancelada'}
                </Badge>
              </div>
            </div>

            {/* Info da mesa */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {/* Responsável pelo cliente */}
              {order?.customer_name && (
                <div className="flex items-center gap-2 col-span-2">
                  <User className="w-4 h-4 shrink-0 text-primary" />
                  <span className="font-medium truncate">{order.customer_name}</span>
                  {order?.customer_phone && (
                    <span className="flex items-center gap-1 text-muted-foreground ml-auto shrink-0">
                      <Phone className="w-3.5 h-3.5" />
                      {order.customer_phone}
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <UserCheck className="w-4 h-4 shrink-0" />
                <span className="truncate">{(order as Order & { profiles?: { name?: string } })?.profiles?.name ?? '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4 shrink-0" />
                <span>
                  {order?.created_at
                    ? new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground col-span-2">
                <Users className="w-4 h-4 shrink-0" />
                {editingPeople ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      value={peopleInput}
                      onChange={(e) => setPeopleInput(e.target.value)}
                      className="h-6 w-16 text-xs px-2"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') savePeopleCount() }}
                    />
                    <button onClick={savePeopleCount} className="text-primary hover:text-primary/80">
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={startEditPeople}
                    className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                  >
                    <span>{people} pessoa{people > 1 ? 's' : ''}</span>
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </SheetHeader>

          {/* Lista de itens */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading && !order && (
              <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
            )}
            {items.length === 0 && !loading && (
              <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                <Receipt className="w-12 h-12 opacity-30" />
                <p className="text-sm">Nenhum item no pedido</p>
                <Button size="sm" variant="outline" onClick={() => setShowAddItem(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar item
                </Button>
              </div>
            )}
            <div className="space-y-2">
              {items.map((item) => {
                const cfg = KITCHEN_STATUS_CONFIG[item.kitchen_status]
                return (
                  <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border bg-background">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{item.quantity}×</span>
                        <span className="text-sm flex-1 truncate">{item.product_name}</span>
                        <span className="text-sm font-medium shrink-0">
                          {formatCurrency(item.unit_price * item.quantity)}
                        </span>
                      </div>
                      {item.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 ml-6">{item.notes}</p>
                      )}
                      <div className="mt-1.5 ml-6">
                        <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium', cfg.color)}>
                          <cfg.icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                    {podeExcluirItem && order?.status === 'open' && item.kitchen_status === 'pending' && (
                      <button
                        onClick={() => handleRemoveItem(item)}
                        className="text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Rodapé */}
          {order?.status === 'open' && (
            <div className="border-t px-6 py-4 space-y-3">
              {/* Totais */}
              <div className="space-y-1">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(total)}</span>
                </div>
                {people > 1 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CircleDollarSign className="w-3.5 h-3.5" />
                      Por pessoa ({people}x)
                    </span>
                    <span className="font-medium text-foreground">{formatCurrency(total / people)}</span>
                  </div>
                )}
              </div>
              <Separator />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowAddItem(true)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar
                </Button>
                {total === 0 ? (
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={handleLiberarMesa}
                    disabled={liberando}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {liberando ? 'Liberando...' : 'Liberar Comanda'}
                  </Button>
                ) : (
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => setShowFechar(true)}
                  >
                    <Receipt className="w-4 h-4 mr-1" />
                    Fechar Conta
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AdicionarItemModal
        open={showAddItem}
        onClose={() => setShowAddItem(false)}
        onConfirm={handleAddItems}
      />

      <FecharContaModal
        open={showFechar}
        onClose={() => setShowFechar(false)}
        order={order}
        onClosed={() => {
          onUpdated()
          onClose()
        }}
      />
    </>
  )
}
