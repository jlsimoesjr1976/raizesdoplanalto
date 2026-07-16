import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus, Search, Pencil, Trash2, Paperclip, CalendarDays,
  ArrowDownCircle, ArrowUpCircle, Wallet, CalendarRange, CalendarClock, User, History,
  DollarSign, CheckCircle2, FileText, AlertTriangle,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { LancamentoFormModal } from './LancamentoFormModal'
import { BaixaModal, settlementLabel } from './BaixaModal'
import type { FinancialEntry, FinancialEntryType } from '@/types/database'

// ── Datas (semana: domingo a sábado) ────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayStr(): string {
  return toDateStr(new Date())
}

function weekStartStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay()) // volta até domingo
  return toDateStr(d)
}

function monthStartStr(): string {
  const d = new Date()
  d.setDate(1)
  return toDateStr(d)
}

function weekEndStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay() + 6) // sábado
  return toDateStr(d)
}

function monthEndStr(): string {
  const d = new Date()
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

// ── Seção por tipo (Pagamentos / Recebimentos) ──────────────────────────────

function FinanceSection({ type }: { type: FinancialEntryType }) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [cardFilter, setCardFilter] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editEntry, setEditEntry] = useState<FinancialEntry | null>(null)
  const [baixaEntry, setBaixaEntry] = useState<FinancialEntry | null>(null)

  const isPayment = type === 'payment'
  const label = isPayment ? 'Pagamento' : 'Recebimento'
  const accentText = isPayment ? 'text-red-600' : 'text-green-600'

  // Ordenado do vencimento mais próximo para o mais distante
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['financial-entries', type],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_entries')
        .select('*')
        .eq('type', type)
        .order('entry_date', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as FinancialEntry[]
    },
  })

  const today = todayStr()
  const weekStart = weekStartStr()
  const monthStart = monthStartStr()

  const sum = (from: string) =>
    entries
      .filter((e) => e.entry_date >= from && e.entry_date <= today)
      .reduce((s, e) => s + Number(e.amount), 0)

  const totalDay = entries
    .filter((e) => e.entry_date === today)
    .reduce((s, e) => s + Number(e.amount), 0)
  const totalWeek = sum(weekStart)
  const totalMonth = sum(monthStart)

  // A vencer: lançamentos em aberto (não baixados) de hoje até o fim do período
  const weekEnd = weekEndStr()
  const monthEnd = monthEndStr()
  const sumDue = (until: string) =>
    entries
      .filter((e) => !e.paid && e.entry_date >= today && e.entry_date <= until)
      .reduce((s, e) => s + Number(e.amount), 0)
  const dueWeek = sumDue(weekEnd)
  const dueMonth = sumDue(monthEnd)

  // Vencidos: em aberto com vencimento anterior a hoje
  const overdue = entries
    .filter((e) => !e.paid && e.entry_date < today)
    .reduce((s, e) => s + Number(e.amount), 0)

  // Predicado de cada card — o mesmo usado para somar o valor exibido
  const cardPredicates: Record<string, (e: FinancialEntry) => boolean> = {
    day: (e) => e.entry_date === today,
    week: (e) => e.entry_date >= weekStart && e.entry_date <= today,
    month: (e) => e.entry_date >= monthStart && e.entry_date <= today,
    dueWeek: (e) => !e.paid && e.entry_date >= today && e.entry_date <= weekEnd,
    dueMonth: (e) => !e.paid && e.entry_date >= today && e.entry_date <= monthEnd,
    overdue: (e) => !e.paid && e.entry_date < today,
  }

  const cards = [
    { key: 'day', title: 'Total do Dia', value: totalDay, icon: CalendarClock, hint: formatDate(today) },
    { key: 'week', title: 'Acumulado da Semana', value: totalWeek, icon: CalendarRange, hint: `desde ${formatDate(weekStart)} (dom)` },
    { key: 'month', title: 'Acumulado do Mês', value: totalMonth, icon: CalendarDays, hint: `desde ${formatDate(monthStart)}` },
    { key: 'dueWeek', title: 'A vencer na semana', value: dueWeek, icon: CalendarRange, hint: `em aberto até ${formatDate(weekEnd)}`, due: true },
    { key: 'dueMonth', title: 'A vencer no mês atual', value: dueMonth, icon: CalendarDays, hint: `em aberto até ${formatDate(monthEnd)}`, due: true },
    { key: 'overdue', title: 'Vencidos', value: overdue, icon: AlertTriangle, hint: `em aberto antes de ${formatDate(today)}`, overdue: true },
  ]

  const filtered = entries.filter((e) => {
    if (cardFilter && !cardPredicates[cardFilter](e)) return false
    const q = search.toLowerCase()
    return (
      e.description.toLowerCase().includes(q) ||
      (e.beneficiary_name ?? '').toLowerCase().includes(q)
    )
  })

  async function handleDelete(e: FinancialEntry) {
    if (!confirm(`Tem certeza que deseja excluir o ${label.toLowerCase()} "${e.description}" de ${formatCurrency(Number(e.amount))}?\n\nEsta ação não pode ser desfeita.`)) return
    await supabase.from('financial_entries').delete().eq('id', e.id)
    // Remove anexos e comprovante do storage (best effort)
    const paths = [...(e.attachments ?? []).map((a) => a.path), ...(e.receipt ? [e.receipt.path] : [])]
    if (paths.length) {
      supabase.storage.from('financial-attachments').remove(paths)
    }
    queryClient.invalidateQueries({ queryKey: ['financial-entries', type] })
  }

  return (
    <div className="space-y-4">
      {/* Cards de totais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {cards.map((c) => (
          <Card
            key={c.title}
            role="button"
            tabIndex={0}
            title={cardFilter === c.key ? 'Clique para limpar o filtro' : 'Clique para filtrar a lista abaixo'}
            onClick={() => setCardFilter((cur) => (cur === c.key ? null : c.key))}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCardFilter((cur) => (cur === c.key ? null : c.key)) } }}
            className={cn(
              'border shadow-sm cursor-pointer transition-shadow hover:shadow-md select-none',
              c.due && 'bg-amber-50/60 border-amber-200',
              c.overdue && 'bg-red-50/60 border-red-200',
              cardFilter === c.key && 'ring-2 ring-primary border-primary'
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-muted-foreground">{c.title}</p>
                <c.icon className={cn('w-4 h-4', c.overdue ? 'text-red-600' : c.due ? 'text-amber-600' : accentText)} />
              </div>
              <p className={cn('text-xl font-bold', c.overdue ? 'text-red-700' : c.due ? 'text-amber-700' : accentText)}>{formatCurrency(c.value)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Indicador de filtro ativo */}
      {cardFilter && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            Mostrando {filtered.length} lançamento{filtered.length !== 1 ? 's' : ''} de{' '}
            <span className="font-medium text-foreground">{cards.find((c) => c.key === cardFilter)?.title}</span>
          </span>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setCardFilter(null)}>
            Limpar filtro
          </Button>
        </div>
      )}

      {/* Busca + Novo */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => { setEditEntry(null); setShowForm(true) }}>
          <Plus className="w-4 h-4 mr-1.5" />
          Novo {label}
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Vazio */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-14 text-muted-foreground">
          <Wallet className="w-12 h-12 opacity-30" />
          <p className="text-sm">
            {search ? `Nenhum ${label.toLowerCase()} encontrado` : `Nenhum ${label.toLowerCase()} registrado`}
          </p>
        </div>
      )}

      {/* Grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow"
            >
              {isPayment
                ? <ArrowDownCircle className="w-8 h-8 text-red-500/70 shrink-0" />
                : <ArrowUpCircle className="w-8 h-8 text-green-500/70 shrink-0" />}

              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{e.description}</p>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="w-3 h-3" />
                    {formatDate(e.entry_date)}
                  </span>
                  {e.beneficiary_name && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {e.beneficiary_name}
                    </span>
                  )}
                  {e.attachments?.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Paperclip className="w-3 h-3" />
                      {e.attachments.length} anexo{e.attachments.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {e.history?.length > 0 && (
                    <span className="flex items-center gap-1">
                      <History className="w-3 h-3" />
                      {e.history.length} lançamento{e.history.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {e.notes && <span className="truncate max-w-52">{e.notes}</span>}
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className={cn('font-semibold', accentText)}>
                  {formatCurrency(Number(e.paid && e.final_amount !== null ? e.final_amount : e.amount))}
                </p>
                {e.paid ? (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    Baixado · {settlementLabel(e.payment_method)}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">em aberto</span>
                )}
              </div>

              <div className="flex gap-1.5 shrink-0">
                {!e.paid && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-600 hover:text-green-700 border-green-200 hover:bg-green-50"
                    title="Efetuar baixa"
                    onClick={() => setBaixaEntry(e)}
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                  </Button>
                )}
                {e.paid && e.receipt && (
                  <Button
                    size="sm"
                    variant="outline"
                    title="Abrir comprovante"
                    onClick={() => window.open(e.receipt!.url, '_blank')}
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button size="sm" variant="outline" title="Editar" onClick={() => { setEditEntry(e); setShowForm(true) }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  title="Excluir"
                  onClick={() => handleDelete(e)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <LancamentoFormModal
        open={showForm}
        type={type}
        entry={editEntry}
        onClose={() => { setShowForm(false); setEditEntry(null) }}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['financial-entries', type] })}
      />

      <BaixaModal
        open={!!baixaEntry}
        entry={baixaEntry}
        onClose={() => setBaixaEntry(null)}
        onSettled={() => queryClient.invalidateQueries({ queryKey: ['financial-entries', type] })}
      />
    </div>
  )
}

// ── Componente principal ────────────────────────────────────────────────────

export function FinanceiroManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Financeiro</h2>
        <p className="text-muted-foreground text-sm mt-0.5">
          Controle de pagamentos e recebimentos
        </p>
      </div>

      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments" className="gap-1.5">
            <ArrowDownCircle className="w-4 h-4" />
            Pagamentos
          </TabsTrigger>
          <TabsTrigger value="receipts" className="gap-1.5">
            <ArrowUpCircle className="w-4 h-4" />
            Recebimentos
          </TabsTrigger>
        </TabsList>
        <TabsContent value="payments" className="mt-4">
          <FinanceSection type="payment" />
        </TabsContent>
        <TabsContent value="receipts" className="mt-4">
          <FinanceSection type="receipt" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
