import { useEffect, useState, FormEvent } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { FileText, Loader2, Info } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { applyCpfMask, applyCnpjMask } from './FreelancerFormModal'
import { gerarContratoPdf, type ContratanteData } from '@/lib/contrato'
import type { Freelancer } from '@/types/database'

interface Props {
  open: boolean
  freelancer: Freelancer | null
  onClose: () => void
  onSaved?: () => void
}

function todayBR() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function GerarContratoModal({ open, freelancer, onClose, onSaved }: Props) {
  const [contratante, setContratante] = useState<ContratanteData | null>(null)
  const [loadingCfg, setLoadingCfg] = useState(true)

  // Campos complementares do contrato
  const [profissao, setProfissao] = useState('')
  const [rg, setRg] = useState('')
  const [enderecoFreela, setEnderecoFreela] = useState('')
  const [funcao, setFuncao] = useState('')
  const [data, setData] = useState('')
  const [horaInicio, setHoraInicio] = useState('18:00')
  const [horaFim, setHoraFim] = useState('23:00')
  const [valor, setValor] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('término do evento, via PIX')
  const [avisoPrevio, setAvisoPrevio] = useState('24')
  const [dataAssinatura, setDataAssinatura] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoadingCfg(true)

    // Pré-preenche com o último contrato salvo, se houver
    const saved = freelancer?.contract_data ?? null
    setProfissao(saved?.profissao ?? '')
    setFuncao(saved?.funcao ?? '')
    setRg(saved?.rg ?? '')
    setEnderecoFreela(saved?.endereco ?? '')
    setData(saved?.data ?? '')
    setHoraInicio(saved?.horaInicio || '18:00')
    setHoraFim(saved?.horaFim || '23:00')
    setValor(saved?.valor || (freelancer ? Number(freelancer.daily_rate).toFixed(2).replace('.', ',') : ''))
    setFormaPagamento(saved?.formaPagamento ?? 'término do evento, via PIX')
    setAvisoPrevio(saved?.avisoPrevio ?? '24')
    // Data de assinatura sempre inicia em hoje (ajustável)
    setDataAssinatura(todayBR())

    // Carrega dados do contratante (Configurações / Fiscal)
    async function loadCfg() {
      const keys = [
        'razao_social', 'restaurant_name', 'cnpj', 'fiscal_logradouro', 'fiscal_numero',
        'fiscal_complemento', 'fiscal_bairro', 'fiscal_municipio', 'fiscal_uf', 'fiscal_cep',
      ]
      const { data: rows } = await supabase.from('settings').select('key, value').in('key', keys)
      const m = new Map((rows ?? []).map((r) => [r.key, String(r.value ?? '').replace(/^"|"$/g, '')]))

      const nome = m.get('razao_social') || m.get('restaurant_name') || 'Raízes do Planalto'
      const cnpj = m.get('cnpj') ? applyCnpjMask(m.get('cnpj')!) : ''
      const partesEnd = [
        m.get('fiscal_logradouro'),
        m.get('fiscal_numero'),
        m.get('fiscal_complemento'),
        m.get('fiscal_bairro'),
        m.get('fiscal_municipio') && m.get('fiscal_uf') ? `${m.get('fiscal_municipio')} - ${m.get('fiscal_uf')}` : m.get('fiscal_municipio'),
        m.get('fiscal_cep') ? `CEP ${m.get('fiscal_cep')}` : '',
      ].filter(Boolean)
      setContratante({
        nome,
        documento: cnpj,
        endereco: partesEnd.join(', '),
        cidadeUf: m.get('fiscal_municipio') && m.get('fiscal_uf') ? `${m.get('fiscal_municipio')} - ${m.get('fiscal_uf')}` : '',
      })
      setLoadingCfg(false)
    }
    loadCfg()
  }, [open, freelancer])

  async function handleGenerate(e: FormEvent) {
    e.preventDefault()
    if (!freelancer || !contratante) return
    setGenerating(true)
    try {
      const doc = gerarContratoPdf(contratante, {
        nome: freelancer.name,
        profissao: profissao.trim() || funcao.trim() || 'Freelancer',
        cpf: applyCpfMask(freelancer.cpf),
        rg: rg.trim() || '—',
        endereco: enderecoFreela.trim() || '—',
        funcao: funcao.trim() || profissao.trim() || 'Freelancer',
        data: data.trim() || '—',
        horaInicio,
        horaFim,
        valor: valor.trim(),
        formaPagamento: formaPagamento.trim(),
        avisoPrevio: avisoPrevio.trim() || '24',
        dataAssinatura: dataAssinatura.trim() || todayBR(),
      })
      const nomeArq = `Contrato_${freelancer.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
      doc.save(nomeArq)

      // Armazena os campos para pré-preencher o próximo contrato
      const contractData = {
        profissao: profissao.trim(),
        funcao: funcao.trim(),
        rg: rg.trim(),
        endereco: enderecoFreela.trim(),
        data: data.trim(),
        horaInicio,
        horaFim,
        valor: valor.trim(),
        formaPagamento: formaPagamento.trim(),
        avisoPrevio: avisoPrevio.trim(),
        dataAssinatura: dataAssinatura.trim(),
      }
      await supabase.from('freelancers').update({ contract_data: contractData }).eq('id', freelancer.id)
      onSaved?.()
      onClose()
    } finally {
      setGenerating(false)
    }
  }

  if (!freelancer) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Gerar Contrato — {freelancer.name}
          </DialogTitle>
        </DialogHeader>

        {loadingCfg ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando dados do contratante...
          </div>
        ) : (
          <form onSubmit={handleGenerate} className="space-y-4 py-1">
            {/* Contratante (somente leitura) */}
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-0.5">
              <p className="font-semibold text-sm">{contratante?.nome}</p>
              {contratante?.documento && <p className="text-muted-foreground">CNPJ: {contratante.documento}</p>}
              {contratante?.endereco
                ? <p className="text-muted-foreground">{contratante.endereco}</p>
                : <p className="text-amber-600 flex items-center gap-1"><Info className="w-3 h-3" />Preencha o endereço em Configurações → Fiscal para constar no contrato.</p>}
            </div>

            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados do Contratado</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Profissão</Label>
                <Input value={profissao} onChange={(e) => setProfissao(e.target.value)} placeholder="Ex: Garçom / Bartender" />
              </div>
              <div className="space-y-1.5">
                <Label>Função / Cargo</Label>
                <Input value={funcao} onChange={(e) => setFuncao(e.target.value)} placeholder="Ex: Garçom" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>RG</Label>
                <Input value={rg} onChange={(e) => setRg(e.target.value)} placeholder="RG do freelancer" />
              </div>
              <div className="space-y-1.5">
                <Label>CPF</Label>
                <Input value={applyCpfMask(freelancer.cpf)} disabled />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Endereço completo do freelancer</Label>
              <Input value={enderecoFreela} onChange={(e) => setEnderecoFreela(e.target.value)} placeholder="Rua, nº, bairro, cidade - UF" />
            </div>

            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Execução e Pagamento</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-3 sm:col-span-1">
                <Label>Data / Dias</Label>
                <Input value={data} onChange={(e) => setData(e.target.value)} placeholder="Ex: 12/07/2026 ou Sáb." />
              </div>
              <div className="space-y-1.5">
                <Label>Início</Label>
                <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Término</Label>
                <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor da diária (R$)</Label>
                <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label>Aviso prévio (horas)</Label>
                <Input value={avisoPrevio} onChange={(e) => setAvisoPrevio(e.target.value)} placeholder="24" inputMode="numeric" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Forma de pagamento</Label>
              <Input value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} placeholder="Ex: término do evento, via PIX" />
            </div>
            <div className="space-y-1.5">
              <Label>Data de assinatura</Label>
              <Input value={dataAssinatura} onChange={(e) => setDataAssinatura(e.target.value)} placeholder="DD/MM/AAAA" />
            </div>

            <p className="text-xs text-muted-foreground">
              O PDF será baixado para assinatura digital no <span className="font-medium">gov.br</span>. Depois, use o botão “Anexos” do card para enviar o contrato assinado.
            </p>

            <DialogFooter className="pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={generating}>
                {generating ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Gerando...</> : <><FileText className="w-4 h-4 mr-1.5" />Gerar PDF</>}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
