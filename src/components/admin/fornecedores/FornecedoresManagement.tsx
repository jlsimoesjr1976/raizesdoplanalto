import { useEffect, useState, FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Plus, Search, Pencil, Trash2, Phone, Mail, Truck,
} from 'lucide-react'
import {
  applyCpfMask, applyCnpjMask, applyPhoneMask,
} from '@/components/admin/freelancers/FreelancerFormModal'
import type { Supplier } from '@/types/database'

// CPF (11 dígitos) ou CNPJ (14 dígitos), decidido pelo tamanho digitado
function applyCpfCnpjMask(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  return d.length <= 11 ? applyCpfMask(d) : applyCnpjMask(d)
}

function docLabel(digits: string) {
  return digits.length === 11 ? 'CPF' : 'CNPJ'
}

function docMask(digits: string) {
  return digits.length === 11 ? applyCpfMask(digits) : applyCnpjMask(digits)
}

// ── Formulário ──────────────────────────────────────────────────────────────

interface FormProps {
  open: boolean
  supplier: Supplier | null
  onClose: () => void
  onSaved: () => void
}

function FornecedorFormModal({ open, supplier, onClose, onSaved }: FormProps) {
  const [name, setName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setError('')
      if (supplier) {
        setName(supplier.name)
        setCnpj(supplier.cnpj ? applyCpfCnpjMask(supplier.cnpj) : '')
        setPhone(supplier.phone ? applyPhoneMask(supplier.phone) : '')
        setEmail(supplier.email ?? '')
        setNotes(supplier.notes ?? '')
      } else {
        setName(''); setCnpj(''); setPhone(''); setEmail(''); setNotes('')
      }
    }
  }, [open, supplier])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('O nome é obrigatório.'); return }
    const cnpjDigits = cnpj.replace(/\D/g, '')
    if (cnpjDigits && cnpjDigits.length !== 11 && cnpjDigits.length !== 14) {
      setError('Documento inválido — informe 11 dígitos (CPF) ou 14 dígitos (CNPJ).')
      return
    }

    setSaving(true)
    const payload = {
      name: name.trim(),
      cnpj: cnpjDigits || null,
      phone: phone.replace(/\D/g, '') || null,
      email: email.trim() || null,
      notes: notes.trim() || null,
    }
    const { error: err } = supplier
      ? await supabase.from('suppliers').update(payload).eq('id', supplier.id)
      : await supabase.from('suppliers').insert(payload)
    setSaving(false)
    if (err) { setError('Erro ao salvar: ' + err.message); return }
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{supplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="sup-name">Nome / Razão Social *</Label>
            <Input id="sup-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do fornecedor" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-cnpj">CPF / CNPJ</Label>
            <Input id="sup-cnpj" value={cnpj} onChange={(e) => setCnpj(applyCpfCnpjMask(e.target.value))} placeholder="CPF ou CNPJ" inputMode="numeric" maxLength={18} />
            <p className="text-xs text-muted-foreground">
              Pessoa física: informe o CPF (11 dígitos). Pessoa jurídica: CNPJ (14 dígitos).
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sup-phone">Telefone</Label>
              <Input id="sup-phone" value={phone} onChange={(e) => setPhone(applyPhoneMask(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" maxLength={15} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-email">E-mail</Label>
              <Input id="sup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@..." />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-notes">Observações</Label>
            <Textarea id="sup-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Opcional" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Listagem ────────────────────────────────────────────────────────────────

export function FornecedoresManagement() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null)

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('*').order('name')
      if (error) throw error
      return data as Supplier[]
    },
  })

  const filtered = suppliers.filter((s) => {
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q) || (s.cnpj ?? '').includes(q.replace(/\D/g, '') || '§')
  })

  async function handleDelete(s: Supplier) {
    if (!confirm(`Tem certeza que deseja excluir o fornecedor "${s.name}"?\n\nEsta ação não pode ser desfeita.`)) return
    await supabase.from('suppliers').delete().eq('id', s.id)
    queryClient.invalidateQueries({ queryKey: ['suppliers'] })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Fornecedores</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {suppliers.length} fornecedor{suppliers.length !== 1 ? 'es' : ''} cadastrado{suppliers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => { setEditSupplier(null); setShowForm(true) }}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Fornecedor
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, CPF ou CNPJ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Truck className="w-14 h-14 opacity-30" />
          <p>{search ? 'Nenhum fornecedor encontrado' : 'Nenhum fornecedor cadastrado'}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((s) => (
            <div key={s.id} className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                {s.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium">{s.name}</span>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-muted-foreground">
                  {s.cnpj && <span>{docLabel(s.cnpj)}: {docMask(s.cnpj)}</span>}
                  {s.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {applyPhoneMask(s.phone)}
                    </span>
                  )}
                  {s.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {s.email}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button size="sm" variant="outline" title="Editar" onClick={() => { setEditSupplier(s); setShowForm(true) }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  title="Excluir"
                  onClick={() => handleDelete(s)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <FornecedorFormModal
        open={showForm}
        supplier={editSupplier}
        onClose={() => { setShowForm(false); setEditSupplier(null) }}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['suppliers'] })}
      />
    </div>
  )
}
