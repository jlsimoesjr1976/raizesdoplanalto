import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { History, Search } from 'lucide-react'
import { ExportMenu } from './ExportMenu'
import type { ReportData } from './reportExport'

interface LogRow {
  id: string
  action: string
  entity: string
  entity_id: string | null
  detail: Record<string, unknown> | null
  by_user: string | null
  at: string
}
interface ProfileLite { id: string; name: string }

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  criar:                  { label: 'Criou lançamento',       cls: 'bg-blue-100 text-blue-700' },
  estornar:               { label: 'Estornou',                cls: 'bg-red-100 text-red-700' },
  sugestao_automatica:    { label: 'Sugestão automática',     cls: 'bg-amber-100 text-amber-700' },
  fechar_competencia:     { label: 'Fechou competência',       cls: 'bg-gray-800 text-white' },
  reabrir_competencia:    { label: 'Reabriu competência',      cls: 'bg-purple-100 text-purple-700' },
}

export function AuditoriaTab() {
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [days, setDays] = useState('30')

  const since = useMemo(() => {
    const d = new Date(Date.now() - Number(days) * 86400000)
    return d.toISOString()
  }, [days])

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['acc-logs', since],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acc_logs')
        .select('*')
        .gte('at', since)
        .order('at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data as LogRow[]
    },
  })

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles-lite'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, name')
      return (data ?? []) as ProfileLite[]
    },
  })
  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.name ?? (id ? id.slice(0, 8) : 'Sistema')

  const filtered = logs.filter((l) => {
    if (actionFilter !== 'all' && l.action !== actionFilter) return false
    const q = search.toLowerCase()
    if (!q) return true
    return (
      l.action.toLowerCase().includes(q) ||
      l.entity.toLowerCase().includes(q) ||
      nameOf(l.by_user).toLowerCase().includes(q) ||
      JSON.stringify(l.detail ?? {}).toLowerCase().includes(q)
    )
  })

  const uniqueActions = [...new Set(logs.map((l) => l.action))]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">Trilha de Auditoria</h2>
        <div className="flex gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="365">Último ano</SelectItem>
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as ações</SelectItem>
              {uniqueActions.map((a) => (
                <SelectItem key={a} value={a}>{ACTION_LABELS[a]?.label ?? a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ExportMenu getData={() => auditReportData(filtered, nameOf)} />
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por ação, entidade, usuário..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading && <div className="h-64 rounded-lg bg-muted animate-pulse" />}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center py-14 text-muted-foreground gap-2">
          <History className="w-10 h-10 opacity-30" />
          <p className="text-sm">Nenhum evento de auditoria no período.</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="border rounded-lg divide-y max-h-[600px] overflow-y-auto">
          {filtered.map((l) => {
            const ui = ACTION_LABELS[l.action] ?? { label: l.action, cls: 'bg-muted text-muted-foreground' }
            return (
              <div key={l.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                <span className="text-xs text-muted-foreground shrink-0 w-32">
                  {new Date(l.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${ui.cls}`}>{ui.label}</span>
                <span className="text-xs text-muted-foreground shrink-0">{nameOf(l.by_user)}</span>
                <span className="flex-1 truncate text-xs text-muted-foreground">
                  {l.detail ? Object.entries(l.detail).map(([k, v]) => `${k}: ${v}`).join(' · ') : '—'}
                </span>
                <Badge variant="outline" className="text-[10px] shrink-0">{l.entity}</Badge>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function auditReportData(logs: LogRow[], nameOf: (id: string | null) => string): ReportData {
  return {
    title: 'Trilha de Auditoria — Contabilidade',
    columns: [
      { key: 'at', header: 'Data/hora' },
      { key: 'action', header: 'Ação' },
      { key: 'entity', header: 'Entidade' },
      { key: 'user', header: 'Usuário' },
      { key: 'detail', header: 'Detalhe' },
    ],
    rows: logs.map((l) => ({
      at: new Date(l.at).toLocaleString('pt-BR'),
      action: ACTION_LABELS[l.action]?.label ?? l.action,
      entity: l.entity,
      user: nameOf(l.by_user),
      detail: l.detail ? Object.entries(l.detail).map(([k, v]) => `${k}: ${v}`).join('; ') : '',
    })),
  }
}
