import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send, Loader2, ImagePlus, X, RefreshCw, MessageSquare, Phone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/integrations/supabase/client'
import {
  fetchConversationMessages, sendWhatsAppRaw, sendWhatsAppMedia, type WhatsAppMessage,
} from '@/lib/evolution'

function fmtTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function fmtPhone(digits: string): string {
  let d = digits.replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `+${digits.replace(/\D/g, '')}`
}

interface Props {
  open: boolean
  numberDigits: string  // número com DDI (ex: 5561999998888)
  name: string
  onClose: () => void
}

export function WhatsAppChatModal({ open, numberDigits, name, onClose }: Props) {
  const digits = (numberDigits || '').replace(/\D/g, '')
  const jid = `${digits}@s.whatsapp.net`
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  async function loadMessages() {
    if (!digits) return
    setLoading(true)
    const res = await fetchConversationMessages(jid)
    if (res.ok) {
      // Preserva mensagens enviadas agora (otimistas) que ainda não voltaram do servidor
      setMessages((prev) => {
        const serverMax = res.messages.length ? Math.max(...res.messages.map((m) => m.timestamp)) : 0
        const pendentes = prev.filter((m) => m.id.startsWith('local-') && m.timestamp > serverMax)
        return [...res.messages, ...pendentes]
      })
    }
    setLoading(false)
  }

  useEffect(() => {
    if (open) {
      setReply(''); setError(''); setImage(null); setImagePreview('')
      loadMessages()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, numberDigits])

  // Realtime: novas mensagens capturadas pelo webhook (respostas do cliente)
  useEffect(() => {
    if (!open || !digits) return
    const channel = supabase
      .channel(`wa-chat-${jid}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `jid=eq.${jid}`,
      }, (payload) => {
        const r = payload.new as { message_id: string; from_me: boolean; text: string; ts: number }
        setMessages((prev) => prev.some((m) => m.id === r.message_id)
          ? prev
          : [...prev, { id: r.message_id, fromMe: !!r.from_me, text: r.text ?? '', timestamp: Number(r.ts) }])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jid])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function clearImage() {
    setImage(null); setImagePreview('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSend() {
    const text = reply.trim()
    if (!text && !image) return
    if (!digits) { setError('Número de celular inválido.'); return }
    setSending(true); setError('')

    let res: { ok: boolean; error?: string }
    let bubble = text
    if (image) {
      const path = `${crypto.randomUUID()}-${image.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('marketing-media').upload(path, image)
      if (upErr) { setSending(false); setError('Erro ao enviar a imagem: ' + upErr.message); return }
      const url = supabase.storage.from('marketing-media').getPublicUrl(path).data.publicUrl
      res = await sendWhatsAppMedia(digits, { media: url, mimetype: image.type || 'image/jpeg', fileName: image.name, caption: text })
      bubble = text ? `📷 ${text}` : '📷 Imagem'
    } else {
      res = await sendWhatsAppRaw(digits, text)
    }

    setSending(false)
    if (res.ok) {
      setMessages((prev) => [...prev, { id: `local-${Date.now()}`, fromMe: true, text: bubble, timestamp: Math.floor(Date.now() / 1000) }])
      setReply(''); clearImage()
      // Sincroniza com o servidor após 2s para confirmar a mensagem
      setTimeout(loadMessages, 2000)
    } else {
      setError(res.error ?? 'Erro ao enviar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="w-4 h-4 text-green-600" />
            <span className="truncate">{name}</span>
          </DialogTitle>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone className="w-3 h-3" />{fmtPhone(digits)}
            <button onClick={loadMessages} className="ml-auto hover:text-foreground" title="Atualizar">
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </button>
          </span>
        </DialogHeader>

        {/* Mensagens */}
        <div className="h-80 overflow-y-auto p-4 space-y-2 bg-muted/20">
          {loading && messages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm flex items-center justify-center gap-2 py-8">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          )}
          {!loading && messages.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">
              Nenhuma mensagem ainda. Envie a primeira! 👋
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn('flex', m.fromMe ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
                m.fromMe ? 'bg-green-600 text-white' : 'bg-background border'
              )}>
                {m.text}
                <span className={cn('block text-[10px] mt-1 text-right', m.fromMe ? 'text-white/70' : 'text-muted-foreground')}>
                  {fmtTime(m.timestamp)}
                </span>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Responder */}
        <div className="border-t">
          {imagePreview && (
            <div className="px-3 pt-3">
              <div className="relative inline-block">
                <img src={imagePreview} alt="Prévia" className="max-h-24 rounded-lg border" />
                <button type="button" onClick={clearImage} className="absolute -top-2 -right-2 bg-black/70 text-white rounded-full p-0.5 hover:bg-black">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
          {error && <p className="px-3 pt-2 text-xs text-destructive">{error}</p>}
          <div className="p-3 flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
            <Button variant="outline" size="icon" onClick={() => fileRef.current?.click()} disabled={sending} title="Anexar imagem" className="shrink-0">
              <ImagePlus className="w-4 h-4" />
            </Button>
            <Input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder={image ? 'Legenda (opcional)...' : 'Digite uma mensagem...'}
              disabled={sending}
            />
            <Button onClick={handleSend} disabled={sending || (!reply.trim() && !image)}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
