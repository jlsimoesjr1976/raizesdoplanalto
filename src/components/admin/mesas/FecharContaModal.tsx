import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  CheckCircle2, CreditCard, Banknote, Smartphone,
  Plus, Trash2, CircleDollarSign, Users, Lock,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { supabase } from '@/integrations/supabase/client'
import { PointChargeDialog } from './PointChargeDialog'
import { notifyPagamento } from '@/lib/comandaNotify'
import type { Order } from '@/types/database'

type PaymentMethod = 'cash' | 'debit' | 'credit' | 'pix'

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'pix',    label: 'Pix',            icon: Smartphone, color: 'border-teal-400 bg-teal-50 text-teal-700' },
  { value: 'debit',  label: 'Débito',         icon: CreditCard, color: 'border-blue-400 bg-blue-50 text-blue-700' },
  { value: 'credit', label: 'Crédito',        icon: CreditCard, color: 'border-purple-400 bg-purple-50 text-purple-700' },
  { value: 'cash',   label: 'Dinheiro',       icon: Banknote,   color: 'border-green-400 bg-green-50 text-green-700' },
]

interface PaymentEntry {
  id: number
  method: PaymentMethod
  amount: string
  // Cobrança via maquininha (débito/crédito)
  mpConfirmed?: boolean
  mpPaymentId?: string
}

interface Props {
  open: boolean
  onClose: () => void
  onClosed: () => void
  order: Order | null
}

let nextId = 1

// Formata um valor numérico para o campo de pagamento (ex: 12.5 -> "12,50")
function fmtAmount(v: number): string {
  return v > 0 ? v.toFixed(2).replace('.', ',') : ''
}

export function FecharContaModal({ open, onClose, onClosed, order }: Props) {
  const [servicePercent, setServicePercent] = useState(10)
  const [includeService, setIncludeService] = useState(true)
  const [payments, setPayments] = useState<PaymentEntry[]>([{ id: nextId++, method: 'pix', amount: '' }])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [mpEnabled, setMpEnabled] = useState(false)
  const [chargeEntryId, setChargeEntryId] = useState<number | null>(null)

  useEffect(() => {
    if (open) {
      Promise.all([
        supabase.from('settings').select('value').eq('key', 'service_charge_percent').single(),
        supabase.from('settings').select('value').eq('key', 'service_charge_enabled').single(),
        supabase.from('settings').select('value').eq('key', 'mp_device_id').single(),
        supabase.from('settings').select('value').eq('key', 'mp_point_enabled').single(),
      ]).then(([{ data: pct }, { data: enabled }, { data: device }, { data: pointOn }]) => {
        const pctVal = pct ? Number(pct.value) : 10
        const incl = enabled ? enabled.value !== false && enabled.value !== 'false' : true
        setServicePercent(pctVal)
        setIncludeService(incl)
        const hasDevice = !!String(device?.value ?? '').replace(/^"|"$/g, '')
        const pointEnabled = pointOn?.value === true
        setMpEnabled(hasDevice && pointEnabled)
        // Pré-preenche a primeira forma de pagamento com o total a pagar
        const sub = order?.total ?? 0
        const gt = sub + (incl ? sub * (pctVal / 100) : 0)
        setPayments([{ id: nextId++, method: 'pix', amount: fmtAmount(gt) }])
      })
      setPayments([{ id: nextId++, method: 'pix', amount: '' }])
      setSuccess(false)
      setChargeEntryId(null)
    }
  }, [open])

  const subtotal = order?.total ?? 0
  const serviceCharge = includeService ? subtotal * (servicePercent / 100) : 0
  const grandTotal = subtotal + serviceCharge
  const people = order?.people_count ?? 1
  const perPerson = people > 0 ? grandTotal / people : grandTotal

  const totalPaid = payments.reduce((sum, p) => {
    const v = parseFloat(p.amount.replace(',', '.'))
    return sum + (isNaN(v) ? 0 : v)
  }, 0)
  const remaining = Math.max(0, grandTotal - totalPaid)
  const overpaid = totalPaid > grandTotal ? totalPaid - grandTotal : 0

  // Cartão (débito/crédito) com valor, mas ainda não cobrado na maquininha
  const pendingCardCharge = mpEnabled && payments.some((p) => {
    const v = parseFloat(p.amount.replace(',', '.'))
    return (p.method === 'debit' || p.method === 'credit') && v > 0 && !p.mpConfirmed
  })

  // Regra: se o total devido for 0,00, sempre permitir fechar e liberar a mesa
  const isComplete = totalPaid >= grandTotal && !pendingCardCharge

  function addPayment() {
    // Nova forma já vem com o saldo restante (que pode ser alterado)
    const othersPaid = payments.reduce((sum, p) => {
      const v = parseFloat(p.amount.replace(',', '.'))
      return sum + (isNaN(v) ? 0 : v)
    }, 0)
    const rem = Math.max(0, grandTotal - othersPaid)
    setPayments((prev) => [...prev, { id: nextId++, method: 'pix', amount: fmtAmount(rem) }])
  }

  // Alterna a taxa de serviço e, se houver uma única forma, reajusta ao novo total
  function handleServiceToggle(v: boolean) {
    setIncludeService(v)
    const newTotal = subtotal + (v ? subtotal * (servicePercent / 100) : 0)
    setPayments((prev) => prev.length === 1
      ? [{ ...prev[0], amount: fmtAmount(newTotal), mpConfirmed: false, mpPaymentId: undefined }]
      : prev
    )
  }

  function removePayment(id: number) {
    setPayments((prev) => prev.filter((p) => p.id !== id))
  }

  function updateMethod(id: number, method: PaymentMethod) {
    // Trocar de método invalida uma cobrança já confirmada na maquininha
    setPayments((prev) => prev.map((p) => p.id === id ? { ...p, method, mpConfirmed: false, mpPaymentId: undefined } : p))
  }

  function updateAmount(id: number, amount: string) {
    // Permite apenas números e vírgula/ponto
    const cleaned = amount.replace(/[^0-9.,]/g, '')
    setPayments((prev) => prev.map((p) => p.id === id ? { ...p, amount: cleaned, mpConfirmed: false, mpPaymentId: undefined } : p))
  }

  const chargeEntry = payments.find((p) => p.id === chargeEntryId) ?? null

  function handleChargeApproved(entryId: number, paymentId?: string) {
    setPayments((prev) => prev.map((p) => p.id === entryId ? { ...p, mpConfirmed: true, mpPaymentId: paymentId } : p))
  }

  function fillRemaining(id: number) {
    const othersPaid = payments.reduce((sum, p) => {
      if (p.id === id) return sum
      const v = parseFloat(p.amount.replace(',', '.'))
      return sum + (isNaN(v) ? 0 : v)
    }, 0)
    const fill = Math.max(0, grandTotal - othersPaid)
    setPayments((prev) => prev.map((p) => p.id === id ? { ...p, amount: fill.toFixed(2).replace('.', ',') } : p))
  }

  async function handleConfirm() {
    if (!order || !isComplete) return
    setLoading(true)

    const mpPaymentIds = payments
      .filter((p) => p.mpConfirmed && p.mpPaymentId)
      .map((p) => p.mpPaymentId as string)

    await supabase.from('orders').update({
      status: 'paid',
      closed_at: new Date().toISOString(),
      mp_payment_ids: mpPaymentIds,
    }).eq('id', order.id)

    if (order.table_id) {
      await supabase.from('tables').update({ status: 'free' }).eq('id', order.table_id)
    }

    // Notifica o cliente pelo WhatsApp (pagamento + comanda fechada)
    if (order.customer_phone) {
      const formas = payments
        .map((p) => ({
          label: PAYMENT_OPTIONS.find((o) => o.value === p.method)?.label ?? p.method,
          amount: parseFloat(p.amount.replace(',', '.')) || 0,
        }))
      notifyPagamento(order.customer_phone, order.customer_name, order.table_number ?? '', formas, totalPaid)
    }

    setLoading(false)
    setSuccess(true)
    setTimeout(() => {
      setSuccess(false)
      setPayments([{ id: nextId++, method: 'pix', amount: '' }])
      setIncludeService(false)
      onClosed()
      onClose()
    }, 1600)
  }

  if (!order) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !loading && onClose()}>
      <DialogContent className="max-w-md max-h-[92vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>Fechar Conta — Comanda {order.table_number}</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-12 px-6">
            <CheckCircle2 className="w-16 h-16 text-green-500" />
            <p className="font-semibold text-lg">Conta fechada!</p>
            <p className="text-muted-foreground text-sm">Comanda liberada com sucesso.</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">

              {/* Resumo da conta */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>

                {/* 10% toggle */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm">Taxa de serviço ({servicePercent}%)</p>
                    {includeService && (
                      <p className="text-xs text-muted-foreground">{formatCurrency(serviceCharge)}</p>
                    )}
                  </div>
                  <Switch
                    checked={includeService}
                    onCheckedChange={handleServiceToggle}
                  />
                </div>

                <Separator />

                <div className="flex justify-between font-bold text-base">
                  <span>Total a pagar</span>
                  <span className="text-primary">{formatCurrency(grandTotal)}</span>
                </div>

                {people > 1 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      Por pessoa ({people}x)
                    </span>
                    <span className="font-medium text-foreground">{formatCurrency(perPerson)}</span>
                  </div>
                )}
              </div>

              {/* Pagamentos */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Pagamentos</Label>
                  <button
                    onClick={addPayment}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar forma
                  </button>
                </div>

                {payments.map((payment, idx) => (
                  <div key={payment.id} className="space-y-2 p-3 rounded-lg border bg-background">
                    {/* Selector de método */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {PAYMENT_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => updateMethod(payment.id, opt.value)}
                          className={cn(
                            'flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-colors',
                            payment.method === opt.value
                              ? opt.color + ' border-current'
                              : 'hover:bg-muted text-muted-foreground'
                          )}
                        >
                          <opt.icon className="w-3.5 h-3.5" />
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {/* Valor */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                        <Input
                          value={payment.amount}
                          onChange={(e) => updateAmount(payment.id, e.target.value)}
                          className="pl-9"
                          placeholder="0,00"
                          inputMode="decimal"
                          disabled={payment.mpConfirmed}
                        />
                      </div>
                      {!payment.mpConfirmed && (
                        <button
                          onClick={() => fillRemaining(payment.id)}
                          className="text-xs text-primary hover:underline shrink-0 whitespace-nowrap"
                          title="Preencher com valor restante"
                        >
                          <CircleDollarSign className="w-4 h-4" />
                        </button>
                      )}
                      {payments.length > 1 && (
                        <button
                          onClick={() => removePayment(payment.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Cobrança na maquininha (débito/crédito) */}
                    {mpEnabled && (payment.method === 'debit' || payment.method === 'credit') && (
                      payment.mpConfirmed ? (
                        <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Pago na maquininha
                          {payment.mpPaymentId && <span className="text-muted-foreground">· #{payment.mpPaymentId}</span>}
                          <Lock className="w-3 h-3 ml-auto" />
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full border-primary/40 text-primary hover:bg-primary/5"
                          disabled={!parseFloat(payment.amount.replace(',', '.'))}
                          onClick={() => setChargeEntryId(payment.id)}
                        >
                          <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                          Cobrar na maquininha
                        </Button>
                      )
                    )}

                    {idx === 0 && payments.length === 1 && (
                      <p className="text-xs text-muted-foreground">
                        Clique em <CircleDollarSign className="w-3 h-3 inline" /> para preencher o valor total automaticamente
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Status do pagamento */}
              <div className={cn(
                'rounded-lg p-3 space-y-1 text-sm',
                isComplete ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
              )}>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total pago</span>
                  <span className="font-medium">{formatCurrency(totalPaid)}</span>
                </div>
                {remaining > 0 && (
                  <div className="flex justify-between text-amber-700 font-medium">
                    <span>Falta pagar</span>
                    <span>{formatCurrency(remaining)}</span>
                  </div>
                )}
                {overpaid > 0 && (
                  <div className="flex justify-between text-green-700 font-medium">
                    <span>Troco</span>
                    <span>{formatCurrency(overpaid)}</span>
                  </div>
                )}
                {isComplete && remaining === 0 && (
                  <div className="flex items-center gap-1.5 text-green-700 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Pagamento completo
                  </div>
                )}
              </div>
            </div>

            {/* Rodapé */}
            <div className="px-6 py-4 border-t space-y-2">
              {pendingCardCharge && (
                <p className="text-xs text-amber-700 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  Efetue a cobrança do cartão na maquininha antes de confirmar.
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1">
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={!isComplete || loading}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {loading ? 'Fechando...' : 'Confirmar Pagamento'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>

      {chargeEntry && (
        <PointChargeDialog
          open={chargeEntryId !== null}
          amount={parseFloat(chargeEntry.amount.replace(',', '.')) || 0}
          description={`Comanda ${order.table_number} — Raízes do Planalto`}
          onClose={() => setChargeEntryId(null)}
          onApproved={(result) => handleChargeApproved(chargeEntry.id, result.paymentId)}
        />
      )}
    </Dialog>
  )
}
