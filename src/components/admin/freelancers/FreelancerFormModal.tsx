import { useEffect, useState, FormEvent } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { supabase } from '@/integrations/supabase/client'
import type { Freelancer } from '@/types/database'

// ── Máscaras ────────────────────────────────────────────────────────────────

export function applyCpfMask(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function applyCnpjMask(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export function applyPhoneMask(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// ── Componente ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  freelancer: Freelancer | null
  onClose: () => void
  onSaved: () => void
}

export function FreelancerFormModal({ open, freelancer, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [cpf, setCpf] = useState('')
  const [hasMei, setHasMei] = useState(false)
  const [cnpj, setCnpj] = useState('')
  const [phone, setPhone] = useState('')
  const [dailyRate, setDailyRate] = useState('')
  const [pixKey, setPixKey] = useState('')
  const [registrationDate, setRegistrationDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setError('')
      if (freelancer) {
        setName(freelancer.name)
        setCpf(applyCpfMask(freelancer.cpf))
        setHasMei(freelancer.has_mei)
        setCnpj(freelancer.cnpj ? applyCnpjMask(freelancer.cnpj) : '')
        setPhone(freelancer.phone ? applyPhoneMask(freelancer.phone) : '')
        setDailyRate(String(freelancer.daily_rate))
        setPixKey(freelancer.pix_key ?? '')
        setRegistrationDate(freelancer.registration_date)
      } else {
        setName('')
        setCpf('')
        setHasMei(false)
        setCnpj('')
        setPhone('')
        setDailyRate('')
        setPixKey('')
        setRegistrationDate(new Date().toISOString().split('T')[0])
      }
    }
  }, [open, freelancer])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cpfDigits = cpf.replace(/\D/g, '')
    const cnpjDigits = cnpj.replace(/\D/g, '')
    const phoneDigits = phone.replace(/\D/g, '')

    if (!name.trim()) { setError('O nome é obrigatório.'); return }
    if (cpfDigits.length !== 11) { setError('CPF inválido — informe os 11 dígitos.'); return }
    if (hasMei && cnpjDigits.length !== 14) { setError('CNPJ inválido — informe os 14 dígitos.'); return }
    if (phoneDigits.length > 0 && phoneDigits.length < 10) { setError('Celular inválido.'); return }
    const rate = Number(dailyRate)
    if (!dailyRate || isNaN(rate) || rate <= 0) { setError('Informe um valor de diária válido.'); return }
    if (!registrationDate) { setError('Informe a data de cadastro.'); return }

    setSaving(true)
    const payload = {
      name: name.trim(),
      cpf: cpfDigits,
      has_mei: hasMei,
      cnpj: hasMei ? cnpjDigits : null,
      phone: phoneDigits || null,
      daily_rate: rate,
      pix_key: pixKey.trim() || null,
      registration_date: registrationDate,
    }

    const { error: err } = freelancer
      ? await supabase.from('freelancers').update(payload).eq('id', freelancer.id)
      : await supabase.from('freelancers').insert(payload)

    setSaving(false)
    if (err) { setError('Erro ao salvar: ' + err.message); return }
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{freelancer ? 'Editar Freelancer' : 'Novo Freelancer'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="fl-name">Nome *</Label>
            <Input
              id="fl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              autoFocus
            />
          </div>

          {/* CPF */}
          <div className="space-y-1.5">
            <Label htmlFor="fl-cpf">CPF *</Label>
            <Input
              id="fl-cpf"
              value={cpf}
              onChange={(e) => setCpf(applyCpfMask(e.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
              maxLength={14}
            />
          </div>

          {/* Possui MEI? */}
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div>
              <p className="text-sm font-medium">Possui MEI?</p>
              <p className="text-xs text-muted-foreground">Habilita o campo CNPJ</p>
            </div>
            <Switch
              checked={hasMei}
              onCheckedChange={(v) => { setHasMei(v); if (!v) setCnpj('') }}
            />
          </div>

          {/* CNPJ — habilitado apenas com MEI */}
          <div className="space-y-1.5">
            <Label htmlFor="fl-cnpj" className={!hasMei ? 'text-muted-foreground/50' : ''}>
              CNPJ {hasMei ? '*' : ''}
            </Label>
            <Input
              id="fl-cnpj"
              value={cnpj}
              onChange={(e) => setCnpj(applyCnpjMask(e.target.value))}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
              maxLength={18}
              disabled={!hasMei}
            />
          </div>

          {/* Celular */}
          <div className="space-y-1.5">
            <Label htmlFor="fl-phone">Celular</Label>
            <Input
              id="fl-phone"
              value={phone}
              onChange={(e) => setPhone(applyPhoneMask(e.target.value))}
              placeholder="(00) 00000-0000"
              inputMode="tel"
              maxLength={15}
            />
          </div>

          {/* Valor da Diária + Data de Cadastro */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fl-rate">Valor da Diária (R$) *</Label>
              <Input
                id="fl-rate"
                type="number"
                min={0}
                step="0.01"
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fl-date">Data de Cadastro *</Label>
              <Input
                id="fl-date"
                type="date"
                value={registrationDate}
                onChange={(e) => setRegistrationDate(e.target.value)}
              />
            </div>
          </div>

          {/* Chave Pix */}
          <div className="space-y-1.5">
            <Label htmlFor="fl-pix">Chave Pix</Label>
            <Input
              id="fl-pix"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="CPF, celular, e-mail ou chave aleatória"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
