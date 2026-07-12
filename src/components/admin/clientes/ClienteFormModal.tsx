import { useState, useEffect, FormEvent } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { CheckCircle2, Smartphone, Send, RefreshCw, UserCheck } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { sendWhatsAppText, generateVerificationCode } from '@/lib/evolution'
import type { Customer } from '@/types/database'

const DDI_OPTIONS = [
  { ddi: '+55', label: '🇧🇷 +55 Brasil' },
  { ddi: '+1',  label: '🇺🇸 +1 EUA/Canadá' },
  { ddi: '+351',label: '🇵🇹 +351 Portugal' },
  { ddi: '+54', label: '🇦🇷 +54 Argentina' },
  { ddi: '+598',label: '🇺🇾 +598 Uruguai' },
  { ddi: '+595',label: '🇵🇾 +595 Paraguai' },
  { ddi: '+56', label: '🇨🇱 +56 Chile' },
  { ddi: '+57', label: '🇨🇴 +57 Colômbia' },
]

function applyPhoneMask(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}

type Step = 'form' | 'verify' | 'done'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: (customer: Customer) => void
  customer?: Customer | null
  initialName?: string
}

export function ClienteFormModal({ open, onClose, onSaved, customer, initialName = '' }: Props) {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const [skipValidation, setSkipValidation] = useState(false)
  const [name, setName] = useState('')
  const [ddi, setDdi] = useState('+55')
  const [phone, setPhone] = useState('')
  const [birthday, setBirthday] = useState('')
  const [step, setStep] = useState<Step>('form')
  const [code, setCode] = useState('')
  const [sentCode, setSentCode] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [codeError, setCodeError] = useState('')
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setStep('form')
      setCode(''); setSentCode(''); setCodeInput(''); setCodeError(''); setError('')
      setSkipValidation(false)
      if (customer) {
        setName(customer.name)
        setDdi(customer.phone_ddi ?? '+55')
        setPhone(customer.phone ?? '')
        setBirthday(customer.birthday ?? '')
      } else {
        setName(initialName)
        setDdi('+55')
        setPhone('')
        setBirthday('')
      }
    }
  }, [open, customer, initialName])

  async function handleSendCode(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Nome obrigatório'); return }
    const rawPhone = phone.replace(/\D/g, '')
    if (rawPhone.length < 10) { setError('Celular inválido'); return }

    // Admin: cadastro direto, sem código de validação
    if (isAdmin && skipValidation) {
      await saveCustomer(false)
      return
    }

    setSending(true)
    setError('')

    const generated = generateVerificationCode()
    const msg = `Olá ${name.trim().split(' ')[0]}! Seu código de verificação Raízes do Planalto: *${generated}*`
    const result = await sendWhatsAppText(ddi, rawPhone, msg)

    setSending(false)

    if (!result.ok) {
      // Se Evolution não configurada, pula verificação e salva direto
      if (result.error?.includes('não configurada')) {
        await saveCustomer(false)
        return
      }
      setError(result.error ?? 'Erro ao enviar código')
      return
    }

    setSentCode(generated)
    setStep('verify')
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault()
    if (codeInput.trim() !== sentCode) {
      setCodeError('Código incorreto. Verifique e tente novamente.')
      return
    }
    await saveCustomer(true)
  }

  async function saveCustomer(verified: boolean) {
    setSaving(true)
    const rawPhone = phone.replace(/\D/g, '')
    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      phone_ddi: ddi,
      phone_verified: verified,
      birthday: birthday || null,
    }

    let result: { data: Customer | null; error: unknown }
    if (customer) {
      const { data, error } = await supabase
        .from('customers').update(payload).eq('id', customer.id).select().single()
      result = { data: data as Customer, error }
    } else {
      // Verifica duplicata
      const { data: existing } = await supabase
        .from('customers').select('id').eq('phone', rawPhone).maybeSingle()
      if (existing) {
        setSaving(false)
        setError('Já existe um cliente com este celular.')
        setStep('form')
        return
      }
      const { data, error } = await supabase
        .from('customers').insert(payload).select().single()
      result = { data: data as Customer, error }
    }

    setSaving(false)
    if (result.error) { setError('Erro ao salvar cliente'); setStep('form'); return }
    setStep('done')
    setTimeout(() => { onSaved(result.data!); onClose() }, 1200)
  }

  async function resendCode() {
    const generated = generateVerificationCode()
    const msg = `Olá ${name.trim().split(' ')[0]}! Seu novo código Raízes do Planalto: *${generated}*`
    await sendWhatsAppText(ddi, phone.replace(/\D/g, ''), msg)
    setSentCode(generated)
    setCodeInput('')
    setCodeError('')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {step === 'done' ? 'Cliente salvo!' : customer ? 'Editar Cliente' : 'Novo Cliente'}
          </DialogTitle>
        </DialogHeader>

        {/* ── Sucesso ── */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="w-14 h-14 text-green-500" />
            <p className="font-medium">{name}</p>
            <p className="text-sm text-muted-foreground">Cadastro salvo com sucesso!</p>
          </div>
        )}

        {/* ── Formulário ── */}
        {step === 'form' && (
          <form onSubmit={handleSendCode} className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Nome completo *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="João da Silva"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Celular *</Label>
              <div className="flex gap-2">
                <Select value={ddi} onValueChange={setDdi}>
                  <SelectTrigger className="w-36 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DDI_OPTIONS.map((o) => (
                      <SelectItem key={o.ddi} value={o.ddi}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(applyPhoneMask(e.target.value))}
                  placeholder="(00) 00000-0000"
                  inputMode="tel"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {skipValidation
                  ? 'O cliente será cadastrado sem validação por WhatsApp.'
                  : 'Um código será enviado via WhatsApp para validar o número.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Data de nascimento <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* Opção do administrador: cadastro direto */}
            {isAdmin && (
              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                <div>
                  <p className="text-sm font-medium">Cadastrar sem validação</p>
                  <p className="text-xs text-muted-foreground">Pula o código por WhatsApp (somente admin)</p>
                </div>
                <Switch checked={skipValidation} onCheckedChange={setSkipValidation} />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={sending || saving}>
                {isAdmin && skipValidation ? (
                  saving ? 'Cadastrando...' : (<><UserCheck className="w-4 h-4 mr-1.5" />Cadastrar</>)
                ) : (
                  sending ? 'Enviando...' : (<><Send className="w-4 h-4 mr-1.5" />Enviar código</>)
                )}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* ── Verificação ── */}
        {step === 'verify' && (
          <form onSubmit={handleVerify} className="space-y-4 py-1">
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <Smartphone className="w-10 h-10 text-primary" />
              <p className="font-medium">Código enviado!</p>
              <p className="text-sm text-muted-foreground">
                Enviamos um código de 4 dígitos via WhatsApp para<br />
                <span className="font-medium text-foreground">{ddi} {phone}</span>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Digite o código de 4 dígitos *</Label>
              <Input
                value={codeInput}
                onChange={(e) => { setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setCodeError('') }}
                placeholder="0000"
                inputMode="numeric"
                className="text-center text-2xl tracking-widest"
                maxLength={4}
                autoFocus
                required
              />
              {codeError && <p className="text-sm text-destructive">{codeError}</p>}
            </div>

            <button
              type="button"
              onClick={resendCode}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <RefreshCw className="w-3 h-3" />
              Reenviar código
            </button>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep('form')}>Voltar</Button>
              <Button type="submit" disabled={saving || codeInput.length < 4}>
                {saving ? 'Salvando...' : 'Verificar e salvar'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
