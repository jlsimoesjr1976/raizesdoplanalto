import { useState, useEffect, useRef, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Smartphone, CheckCircle2, XCircle, Loader2, CreditCard, Ban,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  createPaymentIntent, getPaymentIntent, cancelPaymentIntent,
} from '@/lib/mercadopago'

type Phase = 'sending' | 'waiting' | 'approved' | 'error' | 'canceled'

export interface PointChargeResult {
  paymentId?: string
  amount: number
}

interface Props {
  open: boolean
  amount: number
  description: string
  onClose: () => void
  onApproved: (result: PointChargeResult) => void
}

const POLL_MS = 3000

export function PointChargeDialog({ open, amount, description, onClose, onApproved }: Props) {
  const [phase, setPhase] = useState<Phase>('sending')
  const [message, setMessage] = useState('')
  const [intentId, setIntentId] = useState<string | null>(null)
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedRef = useRef(false)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const start = useCallback(async () => {
    setPhase('sending')
    setMessage('')
    setIntentId(null)
    setPaymentId(null)

    const res = await createPaymentIntent(amount, description)
    if (!res.ok || !res.intent) {
      setPhase('error')
      setMessage(res.error ?? 'Falha ao enviar cobrança para a maquininha.')
      return
    }
    setIntentId(res.intent.id)
    setPhase('waiting')

    pollRef.current = setInterval(async () => {
      const status = await getPaymentIntent(res.intent!.id)
      if (!status.ok || !status.intent) return
      const state = status.intent.state
      if (state === 'FINISHED') {
        stopPolling()
        setPaymentId(status.intent.payment?.id ?? null)
        setPhase('approved')
      } else if (state === 'CANCELED' || state === 'ABANDONED') {
        stopPolling()
        setPhase('canceled')
        setMessage('Cobrança cancelada na maquininha.')
      } else if (state === 'ERROR') {
        stopPolling()
        setPhase('error')
        setMessage('A maquininha reportou um erro no pagamento.')
      }
    }, POLL_MS)
  }, [amount, description, stopPolling])

  useEffect(() => {
    if (open && !startedRef.current) {
      startedRef.current = true
      start()
    }
    if (!open) {
      startedRef.current = false
      stopPolling()
    }
    return () => stopPolling()
  }, [open, start, stopPolling])

  // Emite o resultado após aprovação e fecha
  useEffect(() => {
    if (phase === 'approved') {
      const t = setTimeout(() => {
        onApproved({ paymentId: paymentId ?? undefined, amount })
        onClose()
      }, 1500)
      return () => clearTimeout(t)
    }
  }, [phase, paymentId, amount, onApproved, onClose])

  async function handleCancelCharge() {
    stopPolling()
    if (intentId) await cancelPaymentIntent(intentId)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && phase !== 'waiting' && phase !== 'sending') onClose() }}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Cobrança na Maquininha
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <p className="text-3xl font-bold">{formatCurrency(amount)}</p>

          {phase === 'sending' && (
            <>
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Enviando cobrança para a maquininha...</p>
            </>
          )}

          {phase === 'waiting' && (
            <>
              <div className="relative">
                <Smartphone className="w-14 h-14 text-primary" />
                <span className="absolute -right-1 -top-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-primary" />
                </span>
              </div>
              <div>
                <p className="font-medium">Aguardando pagamento</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Peça ao cliente para inserir, aproximar ou passar o cartão na maquininha.
                </p>
              </div>
            </>
          )}

          {phase === 'approved' && (
            <>
              <CheckCircle2 className="w-14 h-14 text-green-500" />
              <div>
                <p className="font-semibold text-green-700">Pagamento aprovado!</p>
                {paymentId && <p className="text-xs text-muted-foreground mt-1">Transação #{paymentId}</p>}
              </div>
            </>
          )}

          {phase === 'canceled' && (
            <>
              <Ban className="w-14 h-14 text-amber-500" />
              <p className="font-medium text-amber-700">{message}</p>
            </>
          )}

          {phase === 'error' && (
            <>
              <XCircle className="w-14 h-14 text-destructive" />
              <p className="text-sm text-destructive">{message}</p>
            </>
          )}
        </div>

        {/* Ações */}
        <div className="flex gap-2">
          {(phase === 'waiting' || phase === 'sending') && (
            <Button variant="outline" className="flex-1" onClick={handleCancelCharge}>
              Cancelar cobrança
            </Button>
          )}
          {(phase === 'error' || phase === 'canceled') && (
            <>
              <Button variant="outline" className="flex-1" onClick={onClose}>Fechar</Button>
              <Button className="flex-1" onClick={start}>Tentar novamente</Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
