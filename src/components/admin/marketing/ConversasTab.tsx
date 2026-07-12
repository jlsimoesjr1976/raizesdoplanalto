import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Search, RefreshCw, Send, Loader2, MessageSquare, UserPlus, CheckCircle2, Phone,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  fetchChats, fetchMessages, sendWhatsAppRaw, phoneKey,
  type WhatsAppChat, type WhatsAppMessage,
} from '@/lib/evolution'
import { ClienteFormModal } from '@/components/admin/clientes/ClienteFormModal'
import type { Customer } from '@/types/database'

function fmtPhone(digits: string): string {
  let d = digits.replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `+${digits.replace(/\D/g, '')}`
}

function avatarText(label: string, hasName: boolean): string {
  if (hasName) {
    const letters = label.replace(/[^A-Za-zÀ-ÿ ]/g, '').trim()
    if (letters) return letters.slice(0, 2).toUpperCase()
  }
  const digits = label.replace(/\D/g, '')
  return digits.slice(-2) || '#'
}

function fmtTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function ConversasTab() {
  const [search, setSearch] = useState('')
  const [chats, setChats] = useState<WhatsAppChat[]>([])
  const [loadingChats, setLoadingChats] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<WhatsAppChat | null>(null)
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [showCadastro, setShowCadastro] = useState(false)
  const [prefillPhone, setPrefillPhone] = useState('')
  const msgEndRef = useRef<HTMLDivElement>(null)

  // Clientes para casar número → nome
  const { data: customers = [], refetch: refetchCustomers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('*')
      return (data ?? []) as Customer[]
    },
  })

  const customerByKey = useMemo(() => {
    const m = new Map<string, Customer>()
    for (const c of customers) {
      if (c.phone) m.set(phoneKey(c.phone), c)
    }
    return m
  }, [customers])

  const matchCustomer = (phone: string) => customerByKey.get(phoneKey(phone)) ?? null

  async function loadChats() {
    setLoadingChats(true)
    setError('')
    const res = await fetchChats()
    if (!res.ok) setError(res.error ?? 'Erro ao carregar conversas')
    else setChats(res.chats)
    setLoadingChats(false)
  }

  useEffect(() => { loadChats() }, [])

  async function openChat(chat: WhatsAppChat) {
    setSelected(chat)
    setMessages([])
    setLoadingMsgs(true)
    const res = await fetchMessages(chat.jid)
    setMessages(res.ok ? res.messages : [])
    setLoadingMsgs(false)
  }

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!selected || !reply.trim()) return
    setSending(true)
    const text = reply.trim()
    const res = await sendWhatsAppRaw(selected.phone, text)
    setSending(false)
    if (res.ok) {
      setMessages((prev) => [...prev, { id: `local-${Date.now()}`, fromMe: true, text, timestamp: Math.floor(Date.now() / 1000) }])
      setReply('')
    } else {
      setError(res.error ?? 'Erro ao enviar')
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return chats.filter((c) => {
      const cust = matchCustomer(c.phone)
      const label = (cust?.name || c.pushName || c.phone).toLowerCase()
      return label.includes(q) || c.phone.includes(q.replace(/\D/g, '') || '§')
    })
  }, [chats, search, customerByKey])

  const selectedCustomer = selected ? matchCustomer(selected.phone) : null

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-13rem)] min-h-[500px]">
      {/* Lista de conversas */}
      <div className="lg:w-80 shrink-0 border rounded-lg flex flex-col overflow-hidden">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">Conversas</p>
            <Button size="sm" variant="ghost" onClick={loadChats} disabled={loadingChats} className="h-7 w-7 p-0">
              <RefreshCw className={cn('w-4 h-4', loadingChats && 'animate-spin')} />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8 h-8 text-sm" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingChats && chats.length === 0 && (
            <div className="p-4 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          )}
          {error && <p className="p-4 text-xs text-destructive">{error}</p>}
          {!loadingChats && filtered.length === 0 && !error && (
            <p className="p-4 text-center text-muted-foreground text-sm">Nenhuma conversa</p>
          )}
          {filtered.map((c) => {
            const cust = matchCustomer(c.phone)
            const hasName = !!(cust?.name || c.pushName)
            const label = cust?.name || c.pushName || fmtPhone(c.phone)
            const active = selected?.jid === c.jid
            return (
              <button
                key={c.jid}
                onClick={() => openChat(c)}
                className={cn(
                  'w-full text-left px-3 py-2.5 border-b flex gap-3 items-center hover:bg-muted/50 transition-colors',
                  active && 'bg-muted'
                )}
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                  {avatarText(label, hasName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm truncate">{label}</span>
                    {cust && <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.lastFromMe ? 'Você: ' : ''}{c.lastText}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{fmtTime(c.timestamp)}</span>
                  {c.unread > 0 && (
                    <span className="bg-green-500 text-white text-[10px] rounded-full min-w-4 h-4 px-1 flex items-center justify-center">{c.unread}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Conversa selecionada */}
      <div className="flex-1 border rounded-lg flex flex-col overflow-hidden min-h-0">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessageSquare className="w-14 h-14 opacity-30" />
            <p className="text-sm">Selecione uma conversa</p>
          </div>
        ) : (
          <>
            {/* Cabeçalho */}
            <div className="p-3 border-b flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                {avatarText(selectedCustomer?.name || selected.pushName || fmtPhone(selected.phone), !!(selectedCustomer?.name || selected.pushName))}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-sm truncate">
                    {selectedCustomer?.name || selected.pushName || fmtPhone(selected.phone)}
                  </span>
                  {selectedCustomer && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                </div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="w-3 h-3" />{fmtPhone(selected.phone)}
                </span>
              </div>
              {!selectedCustomer && (
                <Button size="sm" variant="outline" onClick={() => { setPrefillPhone(selected.phone); setShowCadastro(true) }}>
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  Cadastrar cliente
                </Button>
              )}
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
              {loadingMsgs && (
                <div className="text-center text-muted-foreground text-sm flex items-center justify-center gap-2 py-8">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando mensagens...
                </div>
              )}
              {!loadingMsgs && messages.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">Nenhuma mensagem</p>
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
              <div ref={msgEndRef} />
            </div>

            {/* Responder */}
            <div className="p-3 border-t flex items-center gap-2">
              <Input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="Digite uma mensagem..."
                disabled={sending}
              />
              <Button onClick={handleSend} disabled={sending || !reply.trim()}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Cadastro rápido a partir do número */}
      <ClienteFormModal
        open={showCadastro}
        initialPhone={prefillPhone}
        onClose={() => setShowCadastro(false)}
        onSaved={() => { setShowCadastro(false); refetchCustomers() }}
      />
    </div>
  )
}
