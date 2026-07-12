import { useEffect, useRef, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Paperclip, X, Loader2, FileText, Image as ImageIcon, File } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import type { Freelancer, FinancialAttachment } from '@/types/database'

const BUCKET = 'freelancer-attachments'
const MAX = 10

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return ImageIcon
  if (ext === 'pdf') return FileText
  return File
}

interface Props {
  open: boolean
  freelancer: Freelancer | null
  onClose: () => void
  onChanged: () => void
}

export function FreelancerAnexosModal({ open, freelancer, onClose, onChanged }: Props) {
  const [attachments, setAttachments] = useState<FinancialAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && freelancer) {
      setAttachments(freelancer.attachments ?? [])
      setError('')
    }
  }, [open, freelancer])

  async function persist(next: FinancialAttachment[]) {
    if (!freelancer) return
    setAttachments(next)
    await supabase.from('freelancers').update({ attachments: next }).eq('id', freelancer.id)
    onChanged()
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    if (files.length === 0 || !freelancer) return
    if (attachments.length + files.length > MAX) {
      setError(`Máximo de ${MAX} anexos por freelancer.`)
      return
    }
    setUploading(true)
    setError('')
    const uploaded: FinancialAttachment[] = []
    for (const file of files) {
      const path = `${freelancer.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
      if (upErr) { setError(`Erro ao enviar "${file.name}": ${upErr.message}`); break }
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
      uploaded.push({ name: file.name, url: data.publicUrl, path })
    }
    if (uploaded.length) await persist([...attachments, ...uploaded])
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function removeAttachment(att: FinancialAttachment) {
    await persist(attachments.filter((a) => a.path !== att.path))
    supabase.storage.from(BUCKET).remove([att.path])
  }

  if (!freelancer) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="w-5 h-5 text-primary" />
            Anexos — {freelancer.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <p className="text-xs text-muted-foreground">
            Envie o contrato assinado (gov.br) e outros documentos do freelancer.
          </p>

          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
            className="hidden"
            onChange={handleFiles}
          />

          {attachments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Paperclip className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nenhum anexo ainda</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {attachments.map((att) => {
                const Icon = fileIcon(att.name)
                return (
                  <div key={att.path} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30 text-sm">
                    <Icon className="w-4 h-4 text-primary shrink-0" />
                    <a href={att.url} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">{att.name}</a>
                    <button type="button" onClick={() => removeAttachment(att)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {attachments.length < MAX && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full h-16 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors text-sm disabled:opacity-50"
            >
              {uploading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
                : <><Paperclip className="w-4 h-4" />Anexar arquivos (PDF, imagens...)</>}
            </button>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
