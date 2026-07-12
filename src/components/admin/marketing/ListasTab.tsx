import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Plus, Search, Pencil, Trash2, Users, Send, Loader2, CheckCircle2, Megaphone,
  ImagePlus, X,
} from 'lucide-react'
import { sendWhatsAppRaw, sendWhatsAppMedia } from '@/lib/evolution'
import type { BroadcastList, Customer } from '@/types/database'

function customerDigits(c: Customer): string {
  const ddi = (c.phone_ddi ?? '+55').replace(/\D/g, '')
  const phone = (c.phone ?? '').replace(/\D/g, '')
  if (!phone) return ''
  return `${ddi}${phone}`
}

// ── Modal criar/editar lista ─────────────────────────────────────────────────

function ListaFormModal({ open, lista, customers, onClose, onSaved }: {
  open: boolean; lista: BroadcastList | null; customers: Customer[]; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(lista?.name ?? '')
      setSelected(new Set(lista?.member_ids ?? []))
      setSearch('')
    }
  }, [open, lista])

  const withPhone = customers.filter((c) => c.phone)
  const filtered = withPhone.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    const payload = { name: name.trim(), member_ids: [...selected] }
    if (lista) await supabase.from('broadcast_lists').update(payload).eq('id', lista.id)
    else await supabase.from('broadcast_lists').insert(payload)
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{lista ? 'Editar Lista' : 'Nova Lista de Distribuição'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 flex-1 min-h-0 flex flex-col">
          <div className="space-y-1.5">
            <Label>Nome da lista</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Clientes VIP" autoFocus />
          </div>
          <div className="space-y-1.5 flex-1 min-h-0 flex flex-col">
            <Label>Clientes ({selected.size} selecionado{selected.size !== 1 ? 's' : ''})</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..." className="pl-8 h-8" />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto border rounded-lg divide-y max-h-64">
              {filtered.length === 0 && <p className="p-3 text-sm text-muted-foreground text-center">Nenhum cliente com celular</p>}
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selected.has(c.id) ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                    {selected.has(c.id) && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <span className="text-sm flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.phone}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Modal enviar mensagem ────────────────────────────────────────────────────

function EnviarModal({ open, lista, customers, onClose }: {
  open: boolean; lista: BroadcastList | null; customers: Customer[]; onClose: () => void
}) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, fail: 0 })
  const [finished, setFinished] = useState(false)
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setMessage(''); setSending(false); setProgress({ done: 0, total: 0, fail: 0 }); setFinished(false)
      setImage(null); setImagePreview('')
    }
  }, [open])

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function removeImage() {
    setImage(null)
    setImagePreview('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const members = useMemo(() => {
    if (!lista) return []
    const ids = new Set(lista.member_ids)
    return customers.filter((c) => ids.has(c.id) && c.phone)
  }, [lista, customers])

  async function handleSend() {
    if ((!message.trim() && !image) || members.length === 0) return
    setSending(true)
    setProgress({ done: 0, total: members.length, fail: 0 })

    // Se houver imagem, faz upload uma vez e reutiliza a URL pública
    let mediaUrl = ''
    if (image) {
      const path = `${crypto.randomUUID()}-${image.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('marketing-media').upload(path, image)
      if (upErr) {
        setSending(false)
        alert('Erro ao enviar a imagem: ' + upErr.message)
        return
      }
      mediaUrl = supabase.storage.from('marketing-media').getPublicUrl(path).data.publicUrl
    }

    let fail = 0
    for (let i = 0; i < members.length; i++) {
      const digits = customerDigits(members[i])
      const personalized = message.replace(/\{nome\}/gi, members[i].name.split(' ')[0])
      const res = image
        ? await sendWhatsAppMedia(digits, {
            media: mediaUrl,
            mimetype: image.type || 'image/jpeg',
            fileName: image.name,
            caption: personalized,
          })
        : await sendWhatsAppRaw(digits, personalized)
      if (!res.ok) fail++
      setProgress({ done: i + 1, total: members.length, fail })
      await new Promise((r) => setTimeout(r, 800)) // evita flood
    }
    setSending(false)
    setFinished(true)
  }

  if (!lista) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !sending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" /> Enviar para "{lista.name}"
          </DialogTitle>
        </DialogHeader>

        {finished ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="w-14 h-14 text-green-500" />
            <p className="font-medium">{progress.done - progress.fail} enviadas com sucesso</p>
            {progress.fail > 0 && <p className="text-sm text-destructive">{progress.fail} falharam</p>}
            <Button onClick={onClose} className="mt-2">Fechar</Button>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              {members.length} destinatário{members.length !== 1 ? 's' : ''} com celular cadastrado.
            </p>
            <div className="space-y-1.5">
              <Label>Mensagem {image && <span className="text-muted-foreground font-normal text-xs">(legenda da imagem)</span>}</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Olá {nome}! Temos uma novidade para você..."
                disabled={sending}
              />
              <p className="text-xs text-muted-foreground">Use <code>{'{nome}'}</code> para inserir o primeiro nome do cliente.</p>
            </div>

            {/* Imagem */}
            <div className="space-y-1.5">
              <Label>Imagem <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
              {imagePreview ? (
                <div className="relative w-full rounded-lg overflow-hidden border bg-muted">
                  <img src={imagePreview} alt="Prévia" className="w-full max-h-48 object-contain" />
                  {!sending && (
                    <button type="button" onClick={removeImage} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={sending}
                  className="w-full h-16 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors text-sm disabled:opacity-50"
                >
                  <ImagePlus className="w-4 h-4" /> Anexar imagem
                </button>
              )}
            </div>

            {sending && (
              <div className="space-y-1.5">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
                <p className="text-xs text-muted-foreground text-center">Enviando {progress.done} de {progress.total}...</p>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={sending}>Cancelar</Button>
              <Button onClick={handleSend} disabled={sending || (!message.trim() && !image) || members.length === 0}>
                {sending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Enviando...</> : <><Send className="w-4 h-4 mr-1.5" />Enviar agora</>}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Aba principal ────────────────────────────────────────────────────────────

export function ListasTab() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editLista, setEditLista] = useState<BroadcastList | null>(null)
  const [enviarLista, setEnviarLista] = useState<BroadcastList | null>(null)

  const { data: listas = [], isLoading } = useQuery({
    queryKey: ['broadcast-lists'],
    queryFn: async () => {
      const { data } = await supabase.from('broadcast_lists').select('*').order('created_at', { ascending: false })
      return (data ?? []) as BroadcastList[]
    },
  })

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('*')
      return (data ?? []) as Customer[]
    },
  })

  async function handleDelete(l: BroadcastList) {
    if (!confirm(`Excluir a lista "${l.name}"?`)) return
    await supabase.from('broadcast_lists').delete().eq('id', l.id)
    queryClient.invalidateQueries({ queryKey: ['broadcast-lists'] })
  }

  const reload = () => queryClient.invalidateQueries({ queryKey: ['broadcast-lists'] })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Grupos de clientes para envio de mensagens em massa</p>
        <Button onClick={() => { setEditLista(null); setShowForm(true) }}>
          <Plus className="w-4 h-4 mr-1.5" /> Nova Lista
        </Button>
      </div>

      {isLoading && <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>}

      {!isLoading && listas.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Megaphone className="w-14 h-14 opacity-30" />
          <p>Nenhuma lista de distribuição</p>
        </div>
      )}

      <div className="space-y-2">
        {listas.map((l) => (
          <div key={l.id} className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">{l.name}</p>
              <p className="text-xs text-muted-foreground">{l.member_ids.length} cliente{l.member_ids.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setEnviarLista(l)} disabled={l.member_ids.length === 0}>
                <Send className="w-3.5 h-3.5 mr-1.5" /> Enviar
              </Button>
              <Button size="sm" variant="outline" title="Editar" onClick={() => { setEditLista(l); setShowForm(true) }}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" title="Excluir" onClick={() => handleDelete(l)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ListaFormModal
        open={showForm}
        lista={editLista}
        customers={customers}
        onClose={() => { setShowForm(false); setEditLista(null) }}
        onSaved={reload}
      />
      <EnviarModal
        open={!!enviarLista}
        lista={enviarLista}
        customers={customers}
        onClose={() => setEnviarLista(null)}
      />
    </div>
  )
}
