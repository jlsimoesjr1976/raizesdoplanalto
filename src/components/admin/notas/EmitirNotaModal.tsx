import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { FileText, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { applyCpfMask } from '@/components/admin/freelancers/FreelancerFormModal'
import {
  buildNfcePayload, emitirNfce, consultarNfce, type EmitItem, type FocusResult,
} from '@/lib/focusnfe'
import type { Order } from '@/types/database'

interface Props {
  open: boolean
  order: Order | null
  onClose: () => void
  onEmitted: () => void
}

type Phase = 'form' | 'emitindo' | 'ok' | 'erro'

function focusData(r: FocusResult): Record<string, unknown> {
  return (r.data && typeof r.data === 'object' ? r.data : {}) as Record<string, unknown>
}

export function EmitirNotaModal({ open, order, onClose, onEmitted }: Props) {
  const [incluirCpf, setIncluirCpf] = useState(false)
  const [cpf, setCpf] = useState('')
  const [nome, setNome] = useState('')
  const [phase, setPhase] = useState<Phase>('form')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (open && order) {
      setIncluirCpf(false)
      setCpf('')
      setNome(order.customer_name ?? '')
      setPhase('form')
      setMessage('')
    }
  }, [open, order])

  async function handleEmitir() {
    if (!order) return
    if (incluirCpf && cpf.replace(/\D/g, '').length !== 11) {
      setMessage('CPF inválido — informe os 11 dígitos.'); return
    }
    setPhase('emitindo'); setMessage('')

    // 1) Carrega itens do pedido + dados fiscais dos produtos + empresa
    const [{ data: itemsData }, { data: settingsRows }] = await Promise.all([
      supabase.from('order_items').select('*').eq('order_id', order.id),
      supabase.from('settings').select('key, value').in('key', ['cnpj']),
    ])
    const items = itemsData ?? []
    const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))] as string[]
    const { data: products } = productIds.length
      ? await supabase.from('products').select('id, ncm, cfop, csosn, origem').in('id', productIds)
      : { data: [] as { id: string; ncm: string | null; cfop: string | null; csosn: string | null; origem: number | null }[] }
    const prodMap = new Map((products ?? []).map((p) => [p.id, p]))
    const cnpj = String(settingsRows?.find((r) => r.key === 'cnpj')?.value ?? '').replace(/^"|"$/g, '')

    if (!cnpj) {
      setPhase('erro'); setMessage('CNPJ do emitente não configurado (Configurações → Fiscal).'); return
    }

    const emitItems: EmitItem[] = items.map((i) => {
      const p = i.product_id ? prodMap.get(i.product_id) : undefined
      return {
        descricao: i.product_name,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unit_price),
        ncm: p?.ncm, cfop: p?.cfop, csosn: p?.csosn, origem: p?.origem,
      }
    })
    const total = emitItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)

    const ref = `nfce-${order.id.slice(0, 8)}-${Date.now()}`
    const payload = buildNfcePayload({ cnpj }, {
      cpf: incluirCpf ? cpf : undefined,
      nome: incluirCpf ? (nome.trim() || undefined) : undefined,
      items: emitItems,
      total,
    })

    // 2) Cria a nota (processando) e chama a Focus
    const { data: envRow } = await supabase.from('settings').select('value').eq('key', 'focus_environment').single()
    const environment = String(envRow?.value ?? 'homologacao').replace(/^"|"$/g, '')

    await supabase.from('invoices').insert({
      order_id: order.id, ref, environment, status: 'processando',
      cpf: incluirCpf ? cpf.replace(/\D/g, '') : null,
      customer_name: incluirCpf ? (nome.trim() || null) : (order.customer_name ?? null),
      amount: total,
    })

    const emit = await emitirNfce(ref, payload)
    if (emit.error) {
      await updateInvoice(ref, { status: 'erro', message: emit.error })
      setPhase('erro'); setMessage(emit.error); onEmitted(); return
    }

    // 3) Poll até status final
    let final: FocusResult = emit
    for (let i = 0; i < 6; i++) {
      const d = focusData(final)
      const st = String(d.status ?? '')
      if (st === 'autorizado' || st.includes('erro') || st.includes('rejeit') || st.includes('denegad') || st.includes('cancel')) break
      await new Promise((r) => setTimeout(r, 2500))
      final = await consultarNfce(ref)
    }

    const d = focusData(final)
    const st = String(d.status ?? '')
    const base = final.base ?? ''
    if (st === 'autorizado') {
      await updateInvoice(ref, {
        status: 'autorizado', focus_status: st,
        numero: d.numero ? String(d.numero) : null,
        serie: d.serie ? String(d.serie) : null,
        chave: (d.chave_nfe as string) ?? null,
        danfe_url: d.caminho_danfe ? base + d.caminho_danfe : null,
        xml_url: d.caminho_xml_nota_fiscal ? base + (d.caminho_xml_nota_fiscal as string) : null,
      })
      setPhase('ok'); setMessage('Nota autorizada com sucesso!')
    } else {
      const msg = (d.mensagem_sefaz as string) || (d.mensagem as string) || (d.erros ? JSON.stringify(d.erros) : `Status: ${st || 'desconhecido'}`)
      await updateInvoice(ref, { status: 'erro', focus_status: st, message: msg })
      setPhase('erro'); setMessage(msg)
    }
    onEmitted()
  }

  async function updateInvoice(ref: string, fields: Record<string, unknown>) {
    await supabase.from('invoices').update({ ...fields, updated_at: new Date().toISOString() }).eq('ref', ref)
  }

  if (!order) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && phase !== 'emitindo') onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Emitir Nota — Comanda #{order.table_number}
          </DialogTitle>
        </DialogHeader>

        {phase === 'ok' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="w-14 h-14 text-green-500" />
            <p className="font-medium">{message}</p>
            <Button onClick={onClose} className="mt-2">Fechar</Button>
          </div>
        )}

        {phase === 'erro' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <XCircle className="w-14 h-14 text-destructive" />
            <p className="font-medium text-center">Não foi possível autorizar a nota</p>
            <p className="text-xs text-muted-foreground text-center max-h-32 overflow-y-auto">{message}</p>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" onClick={onClose}>Fechar</Button>
              <Button onClick={() => setPhase('form')}>Tentar novamente</Button>
            </div>
          </div>
        )}

        {phase === 'emitindo' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <p className="font-medium">Emitindo nota fiscal...</p>
            <p className="text-xs text-muted-foreground">Comunicando com a Focus NFe e a SEFAZ.</p>
          </div>
        )}

        {phase === 'form' && (
          <div className="space-y-4 py-1">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Comanda</span>
                <span className="font-medium">#{order.table_number}</span>
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold">{formatCurrency(Number(order.total))}</span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Inserir CPF na nota?</p>
                <p className="text-xs text-muted-foreground">Nota com identificação do consumidor</p>
              </div>
              <Switch checked={incluirCpf} onCheckedChange={setIncluirCpf} />
            </div>

            {incluirCpf && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>CPF do consumidor</Label>
                  <Input value={cpf} onChange={(e) => setCpf(applyCpfMask(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
                </div>
                <div className="space-y-1.5">
                  <Label>Nome (para a nota)</Label>
                  <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do consumidor" />
                </div>
              </div>
            )}

            {message && <p className="text-sm text-destructive">{message}</p>}

            <Separator />

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleEmitir}>
                <FileText className="w-4 h-4 mr-1.5" />
                Emitir Nota Fiscal
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
