import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Plus, Search, Pencil, Trash2, Phone, BriefcaseBusiness, CalendarDays, DollarSign,
  FileText, Paperclip,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  FreelancerFormModal, applyCpfMask, applyCnpjMask, applyPhoneMask,
} from './FreelancerFormModal'
import { GerarContratoModal } from './GerarContratoModal'
import { FreelancerAnexosModal } from './FreelancerAnexosModal'
import type { Freelancer, FinancialEntry } from '@/types/database'

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

// Próximo dia útil (segunda a sexta; pula sábado e domingo)
function nextBusinessDayStr(): string {
  const d = new Date()
  do {
    d.setDate(d.getDate() + 1)
  } while (d.getDay() === 0 || d.getDay() === 6)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function FreelancersManagement() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editFreelancer, setEditFreelancer] = useState<Freelancer | null>(null)
  const [launchingId, setLaunchingId] = useState<string | null>(null)
  const [contratoFreelancer, setContratoFreelancer] = useState<Freelancer | null>(null)
  const [anexosFreelancer, setAnexosFreelancer] = useState<Freelancer | null>(null)

  const { data: freelancers = [], isLoading } = useQuery({
    queryKey: ['freelancers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('freelancers')
        .select('*')
        .order('name')
      if (error) throw error
      return data as Freelancer[]
    },
  })

  const filtered = freelancers.filter((f) => {
    const q = search.toLowerCase()
    return (
      f.name.toLowerCase().includes(q) ||
      f.cpf.includes(q.replace(/\D/g, '') || '§') ||
      (f.phone ?? '').includes(q.replace(/\D/g, '') || '§')
    )
  })

  async function handleDelete(f: Freelancer) {
    if (!confirm(`Excluir o freelancer "${f.name}"? Esta ação não pode ser desfeita.`)) return
    await supabase.from('freelancers').delete().eq('id', f.id)
    queryClient.invalidateQueries({ queryKey: ['freelancers'] })
  }

  function openEdit(f: Freelancer) {
    setEditFreelancer(f)
    setShowForm(true)
  }

  // Lança a diária do freelancer em Pagamentos, para o próximo dia útil.
  // Se já existir lançamento para esse dia, soma ao valor e registra no histórico.
  async function lancarDiaria(f: Freelancer) {
    const rate = Number(f.daily_rate)
    if (rate <= 0) {
      toast({ title: 'Diária não definida', description: `Defina o valor da diária de ${f.name} antes de lançar.`, variant: 'destructive' })
      return
    }
    const dueDate = nextBusinessDayStr()
    if (!confirm(`Lançar diária de ${formatCurrency(rate)} para ${f.name}?\n\nPagamento programado para o próximo dia útil, ${formatDate(dueDate)}.`)) return

    setLaunchingId(f.id)
    try {
      const { data: existing } = await supabase
        .from('financial_entries')
        .select('*')
        .eq('type', 'payment')
        .eq('beneficiary_type', 'freelancer')
        .eq('beneficiary_id', f.id)
        .eq('entry_date', dueDate)
        .maybeSingle()

      const historyItem = {
        at: new Date().toISOString(),
        by: profile?.name ?? 'Usuário',
        amount: rate,
      }

      let total = rate
      if (existing) {
        const entry = existing as FinancialEntry
        total = Number(entry.amount) + rate
        const { error } = await supabase
          .from('financial_entries')
          .update({
            amount: total,
            history: [...(entry.history ?? []), historyItem],
          })
          .eq('id', entry.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('financial_entries').insert({
          type: 'payment',
          description: `Diárias — ${f.name}`,
          amount: rate,
          entry_date: dueDate,
          beneficiary_type: 'freelancer',
          beneficiary_id: f.id,
          beneficiary_name: f.name,
          attachments: [],
          history: [historyItem],
        })
        if (error) throw error
      }

      queryClient.invalidateQueries({ queryKey: ['financial-entries', 'payment'] })
      toast({
        title: 'Diária lançada!',
        description: `${f.name} — total acumulado de ${formatCurrency(total)} para o dia útil ${formatDate(dueDate)}.`,
      })
    } catch {
      toast({ title: 'Erro ao lançar diária', description: 'Tente novamente.', variant: 'destructive' })
    } finally {
      setLaunchingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Freelancers</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {freelancers.length} freelancer{freelancers.length !== 1 ? 's' : ''} cadastrado{freelancers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => { setEditFreelancer(null); setShowForm(true) }}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Freelancer
        </Button>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, CPF ou celular..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Vazio */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <BriefcaseBusiness className="w-14 h-14 opacity-30" />
          <p>{search ? 'Nenhum freelancer encontrado' : 'Nenhum freelancer cadastrado'}</p>
        </div>
      )}

      {/* Grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow"
            >
              {/* Avatar inicial */}
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                {f.name.slice(0, 2).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{f.name}</span>
                  {f.has_mei && (
                    <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-800 border-0">
                      MEI
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-muted-foreground">
                  <span>CPF: {applyCpfMask(f.cpf)}</span>
                  {f.has_mei && f.cnpj && <span>CNPJ: {applyCnpjMask(f.cnpj)}</span>}
                  {f.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {applyPhoneMask(f.phone)}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <CalendarDays className="w-3 h-3" />
                    {formatDate(f.registration_date)}
                  </span>
                </div>
              </div>

              {/* Diária */}
              <div className="hidden sm:block text-right shrink-0">
                <p className="text-xs text-muted-foreground">Diária</p>
                <p className="font-semibold">{formatCurrency(Number(f.daily_rate))}</p>
              </div>

              {/* Ações */}
              <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-green-600 hover:text-green-700 border-green-200 hover:bg-green-50"
                  title="Lançar diária em Pagamentos (próximo dia útil)"
                  onClick={() => lancarDiaria(f)}
                  disabled={launchingId === f.id}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Gerar contrato"
                  onClick={() => setContratoFreelancer(f)}
                >
                  <FileText className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Anexos"
                  className="relative"
                  onClick={() => setAnexosFreelancer(f)}
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  {(f.attachments?.length ?? 0) > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                      {f.attachments.length}
                    </span>
                  )}
                </Button>
                <Button size="sm" variant="outline" title="Editar" onClick={() => openEdit(f)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  title="Excluir"
                  onClick={() => handleDelete(f)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <FreelancerFormModal
        open={showForm}
        freelancer={editFreelancer}
        onClose={() => { setShowForm(false); setEditFreelancer(null) }}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['freelancers'] })}
      />

      <GerarContratoModal
        open={!!contratoFreelancer}
        freelancer={contratoFreelancer}
        onClose={() => setContratoFreelancer(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['freelancers'] })}
      />

      <FreelancerAnexosModal
        open={!!anexosFreelancer}
        freelancer={anexosFreelancer}
        onClose={() => setAnexosFreelancer(null)}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ['freelancers'] })}
      />
    </div>
  )
}
