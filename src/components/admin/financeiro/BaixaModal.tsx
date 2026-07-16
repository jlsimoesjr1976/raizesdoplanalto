import { useEffect, useRef, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Paperclip, X, Loader2, CheckCircle2, FileText } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { openPrivateAttachment } from '@/lib/attachments'
import { formatCurrency } from '@/lib/utils'
import type { FinancialAttachment, FinancialEntry, SettlementMethod } from '@/types/database'

export const SETTLEMENT_METHODS: { value: SettlementMethod; label: string }[] = [
  { value: 'pix', label: 'Pix' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'credito', label: 'Cartão de Crédito' },
  { value: 'debito', label: 'Cartão de Débito' },
  { value: 'dinheiro', label: 'Dinheiro' },
]

export function settlementLabel(method: SettlementMethod | null): string {
  return SETTLEMENT_METHODS.find((m) => m.value === method)?.label ?? '—'
}

interface Props {
  open: boolean
  entry: FinancialEntry | null
  onClose: () => void
  onSettled: () => void
}

export function BaixaModal({ open, entry, onClose, onSettled }: Props) {
  const [method, setMethod] = useState<string>('')
  const [hasFine, setHasFine] = useState(false)
  const [fine, setFine] = useState('')
  const [hasInterest, setHasInterest] = useState(false)
  const [interest, setInterest] = useState('')
  const [receipt, setReceipt] = useState<FinancialAttachment | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const isPayment = entry?.type === 'payment'
  const actionLabel = isPayment ? 'Pagamento' : 'Recebimento'

  useEffect(() => {
    if (open) {
      setMethod(entry?.payment_method ?? '')
      setHasFine(false); setFine('')
      setHasInterest(false); setInterest('')
      setReceipt(null)
      setUploading(false)
      setError('')
    }
  }, [open])

  const baseAmount = Number(entry?.amount ?? 0)
  const fineValue = hasFine ? (Number(fine) || 0) : 0
  const interestValue = hasInterest ? (Number(interest) || 0) : 0
  const finalAmount = baseAmount + fineValue + interestValue

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    const path = `comprovantes/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
    const { error: upErr } = await supabase.storage.from('financial-attachments').upload(path, file)
    if (upErr) {
      setError(`Erro ao enviar comprovante: ${upErr.message}`)
    } else {
      const { data } = supabase.storage.from('financial-attachments').getPublicUrl(path)
      setReceipt({ name: file.name, url: data.publicUrl, path })
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeReceipt() {
    if (receipt) supabase.storage.from('financial-attachments').remove([receipt.path])
    setReceipt(null)
  }

  async function handleConfirm() {
    if (!entry) return
    if (!method) { setError('Selecione a forma de pagamento.'); return }
    if (hasFine && (!fine || Number(fine) <= 0)) { setError('Informe o valor da multa.'); return }
    if (hasInterest && (!interest || Number(interest) <= 0)) { setError('Informe o valor dos juros.'); return }

    setSaving(true)
    const { error: err } = await supabase
      .from('financial_entries')
      .update({
        paid: true,
        paid_at: new Date().toISOString(),
        payment_method: method,
        fine: fineValue,
        interest: interestValue,
        final_amount: finalAmount,
        receipt,
      })
      .eq('id', entry.id)

    setSaving(false)
    if (err) { setError('Erro ao efetuar a baixa: ' + err.message); return }
    onSettled()
    onClose()
  }

  if (!entry) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            Baixa de {actionLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Resumo do lançamento */}
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium truncate">{entry.description}</p>
            <div className="flex justify-between mt-1 text-muted-foreground text-xs">
              <span>Vencimento: {entry.entry_date.split('-').reverse().join('/')}</span>
              <span className="font-semibold text-foreground">{formatCurrency(baseAmount)}</span>
            </div>
          </div>

          {/* Forma de pagamento */}
          <div className="space-y-1.5">
            <Label>Forma de pagamento *</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                {SETTLEMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Multa */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Houve multa?</p>
              <Switch checked={hasFine} onCheckedChange={(v) => { setHasFine(v); if (!v) setFine('') }} />
            </div>
            {hasFine && (
              <div className="space-y-1">
                <Label htmlFor="baixa-fine" className="text-xs">Valor da multa (R$)</Label>
                <Input
                  id="baixa-fine"
                  type="number"
                  min={0}
                  step="0.01"
                  value={fine}
                  onChange={(e) => setFine(e.target.value)}
                  placeholder="0,00"
                />
              </div>
            )}
          </div>

          {/* Juros */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Houve juros?</p>
              <Switch checked={hasInterest} onCheckedChange={(v) => { setHasInterest(v); if (!v) setInterest('') }} />
            </div>
            {hasInterest && (
              <div className="space-y-1">
                <Label htmlFor="baixa-interest" className="text-xs">Valor dos juros (R$)</Label>
                <Input
                  id="baixa-interest"
                  type="number"
                  min={0}
                  step="0.01"
                  value={interest}
                  onChange={(e) => setInterest(e.target.value)}
                  placeholder="0,00"
                />
              </div>
            )}
          </div>

          {/* Cálculo do valor final */}
          <div className="rounded-lg border bg-green-50 p-3 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Valor original</span>
              <span>{formatCurrency(baseAmount)}</span>
            </div>
            {fineValue > 0 && (
              <div className="flex justify-between text-red-600">
                <span>+ Multa</span>
                <span>{formatCurrency(fineValue)}</span>
              </div>
            )}
            {interestValue > 0 && (
              <div className="flex justify-between text-red-600">
                <span>+ Juros</span>
                <span>{formatCurrency(interestValue)}</span>
              </div>
            )}
            <Separator className="my-1" />
            <div className="flex justify-between font-bold text-green-700">
              <span>Valor final pago</span>
              <span>{formatCurrency(finalAmount)}</span>
            </div>
          </div>

          {/* Comprovante */}
          <div className="space-y-1.5">
            <Label>Comprovante de pagamento</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={handleFile}
            />
            {receipt ? (
              <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30 text-sm">
                <FileText className="w-4 h-4 text-primary shrink-0" />
                <button type="button" onClick={() => openPrivateAttachment('financial-attachments', receipt.path)} className="flex-1 truncate hover:underline text-left">
                  {receipt.name}
                </button>
                <button type="button" onClick={removeReceipt} className="text-muted-foreground hover:text-destructive shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full h-14 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors text-sm disabled:opacity-50"
              >
                {uploading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
                  : <><Paperclip className="w-4 h-4" />Anexar comprovante (PDF ou imagem)</>}
              </button>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button
              onClick={handleConfirm}
              disabled={saving || uploading}
              className="bg-green-600 hover:bg-green-700"
            >
              {saving ? 'Confirmando...' : `Confirmar baixa — ${formatCurrency(finalAmount)}`}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
