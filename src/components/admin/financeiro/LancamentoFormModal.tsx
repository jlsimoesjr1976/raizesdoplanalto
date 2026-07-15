import { useEffect, useRef, useState, FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Paperclip, X, Loader2, FileText, Image as ImageIcon, FileSpreadsheet, File, History } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { supabase } from '@/integrations/supabase/client'
import { openPrivateAttachment } from '@/lib/attachments'
import type {
  BeneficiaryType, FinancialAttachment, FinancialEntry, FinancialEntryType,
} from '@/types/database'

const BENEFICIARY_GROUPS: { type: BeneficiaryType; table: string; label: string }[] = [
  { type: 'freelancer', table: 'freelancers', label: 'Freelancers' },
  { type: 'supplier', table: 'suppliers', label: 'Fornecedores' },
  { type: 'employee', table: 'employees', label: 'Funcionários' },
]

interface BeneficiaryOption {
  type: BeneficiaryType
  id: string
  name: string
}

const MAX_ATTACHMENTS = 5

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return ImageIcon
  if (['xlsx', 'xls', 'csv'].includes(ext)) return FileSpreadsheet
  if (ext === 'pdf') return FileText
  return File
}

interface Props {
  open: boolean
  type: FinancialEntryType
  entry: FinancialEntry | null
  onClose: () => void
  onSaved: () => void
}

export function LancamentoFormModal({ open, type, entry, onClose, onSaved }: Props) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [entryDate, setEntryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState<FinancialAttachment[]>([])
  const [beneficiary, setBeneficiary] = useState('') // formato "tipo:id"
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const label = type === 'payment' ? 'Pagamento' : 'Recebimento'

  // Beneficiários: freelancers + fornecedores + funcionários (só em Pagamentos)
  const { data: beneficiaries = [] } = useQuery({
    queryKey: ['beneficiaries'],
    enabled: open && type === 'payment',
    queryFn: async () => {
      const results = await Promise.all(
        BENEFICIARY_GROUPS.map(async (g) => {
          const { data } = await supabase.from(g.table).select('id, name').order('name')
          return (data ?? []).map((r: { id: string; name: string }) => ({
            type: g.type, id: r.id, name: r.name,
          } as BeneficiaryOption))
        })
      )
      return results.flat()
    },
  })

  useEffect(() => {
    if (open) {
      setError('')
      setUploading(false)
      if (entry) {
        setDescription(entry.description)
        setAmount(String(entry.amount))
        setEntryDate(entry.entry_date)
        setNotes(entry.notes ?? '')
        setAttachments(entry.attachments ?? [])
        setBeneficiary(
          entry.beneficiary_type && entry.beneficiary_id
            ? `${entry.beneficiary_type}:${entry.beneficiary_id}`
            : ''
        )
      } else {
        setDescription('')
        setAmount('')
        setEntryDate(new Date().toISOString().split('T')[0])
        setNotes('')
        setAttachments([])
        setBeneficiary('')
      }
    }
  }, [open, entry])

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    if (files.length === 0) return
    const available = MAX_ATTACHMENTS - attachments.length
    if (files.length > available) {
      setError(`Máximo de ${MAX_ATTACHMENTS} anexos por registro (restam ${available}).`)
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setUploading(true)
    setError('')
    const uploaded: FinancialAttachment[] = []
    for (const file of files) {
      const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
      const { error: upErr } = await supabase.storage
        .from('financial-attachments')
        .upload(path, file)
      if (upErr) {
        setError(`Erro ao enviar "${file.name}": ${upErr.message}`)
        break
      }
      const { data } = supabase.storage.from('financial-attachments').getPublicUrl(path)
      uploaded.push({ name: file.name, url: data.publicUrl, path })
    }
    setAttachments((prev) => [...prev, ...uploaded])
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function removeAttachment(att: FinancialAttachment) {
    setAttachments((prev) => prev.filter((a) => a.path !== att.path))
    // Remove do storage em segundo plano (best effort)
    supabase.storage.from('financial-attachments').remove([att.path])
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount)
    if (!description.trim()) { setError('A descrição é obrigatória.'); return }
    if (!amount || isNaN(value) || value <= 0) { setError('Informe um valor válido.'); return }
    if (!entryDate) { setError('Informe a data.'); return }

    setSaving(true)
    const [benType, benId] = beneficiary ? beneficiary.split(':') : [null, null]
    const benOption = beneficiaries.find((b) => b.type === benType && b.id === benId)
    const payload = {
      type,
      description: description.trim(),
      amount: value,
      entry_date: entryDate,
      notes: notes.trim() || null,
      attachments,
      beneficiary_type: (benType as BeneficiaryType) ?? null,
      beneficiary_id: benId,
      beneficiary_name: benOption?.name ?? null,
    }

    const { error: err } = entry
      ? await supabase.from('financial_entries').update(payload).eq('id', entry.id)
      : await supabase.from('financial_entries').insert(payload)

    setSaving(false)
    if (err) { setError('Erro ao salvar: ' + err.message); return }
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? `Editar ${label}` : `Novo ${label}`}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="fin-desc">Descrição *</Label>
            <Input
              id="fin-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === 'payment' ? 'Ex: Fornecedor de hortifruti' : 'Ex: Evento corporativo'}
              autoFocus
            />
          </div>

          {/* Beneficiário — apenas em Pagamentos */}
          {type === 'payment' && (
            <div className="space-y-1.5">
              <Label>Beneficiário</Label>
              <Select value={beneficiary} onValueChange={setBeneficiary}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar beneficiário..." />
                </SelectTrigger>
                <SelectContent>
                  {beneficiaries.length === 0 && (
                    <SelectItem value="__none__" disabled>
                      Nenhum cadastro encontrado
                    </SelectItem>
                  )}
                  {BENEFICIARY_GROUPS.map((g) => {
                    const options = beneficiaries.filter((b) => b.type === g.type)
                    if (options.length === 0) return null
                    return (
                      <div key={g.type}>
                        <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{g.label}</p>
                        {options.map((b) => (
                          <SelectItem key={`${b.type}:${b.id}`} value={`${b.type}:${b.id}`}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </div>
                    )
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Freelancers, fornecedores ou funcionários cadastrados no sistema.
              </p>
            </div>
          )}

          {/* Valor + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fin-amount">Valor (R$) *</Label>
              <Input
                id="fin-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fin-date">Data *</Label>
              <Input
                id="fin-date"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="fin-notes">Observações</Label>
            <Textarea
              id="fin-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalhes adicionais (opcional)"
              rows={2}
            />
          </div>

          {/* Anexos */}
          <div className="space-y-1.5">
            <Label>Anexos <span className="text-muted-foreground text-xs font-normal">({attachments.length}/{MAX_ATTACHMENTS})</span></Label>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,image/*"
              className="hidden"
              onChange={handleFiles}
            />

            {attachments.length > 0 && (
              <div className="space-y-1.5">
                {attachments.map((att) => {
                  const Icon = fileIcon(att.name)
                  return (
                    <div key={att.path} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30 text-sm">
                      <Icon className="w-4 h-4 text-primary shrink-0" />
                      <button
                        type="button"
                        onClick={() => openPrivateAttachment('financial-attachments', att.path)}
                        className="flex-1 truncate hover:underline text-left"
                      >
                        {att.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAttachment(att)}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {attachments.length < MAX_ATTACHMENTS && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full h-16 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors text-sm disabled:opacity-50"
              >
                {uploading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
                  : <><Paperclip className="w-4 h-4" />Anexar arquivos (PDF, XLSX, imagens...)</>}
              </button>
            )}
          </div>

          {/* Histórico de lançamentos (somente leitura) */}
          {entry && entry.history && entry.history.length > 0 && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                Histórico de lançamentos
                <span className="text-muted-foreground text-xs font-normal">({entry.history.length})</span>
              </Label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto rounded-lg border p-2 bg-muted/30">
                {[...entry.history].reverse().map((h, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded bg-background border">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {new Date(h.at).toLocaleDateString('pt-BR')} às{' '}
                        {new Date(h.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className="text-muted-foreground truncate">por {h.by}</p>
                    </div>
                    <span className="font-semibold shrink-0">{formatCurrency(Number(h.amount))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving || uploading}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
