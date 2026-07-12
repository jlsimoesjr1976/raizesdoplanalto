import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Plus, Search, Pencil, Trash2, CheckCircle2, XCircle,
  Phone, Cake, ShoppingBag, Users, FileSpreadsheet,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { ClienteFormModal } from './ClienteFormModal'
import { ImportXlsxModal } from '@/components/admin/ImportXlsxModal'
import { clientesImportConfig } from '@/lib/importConfigs'
import type { Customer } from '@/types/database'

interface CustomerWithStats extends Customer {
  order_count?: number
  total_spent?: number
}

export function ClientesManagement() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name')
      if (error) throw error
      return data as Customer[]
    },
  })

  // Estatísticas por cliente (pedidos pagos)
  const { data: stats = [] } = useQuery({
    queryKey: ['customers-stats'],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('customer_id, total')
        .eq('status', 'paid')
        .not('customer_id', 'is', null)
      return data ?? []
    },
  })

  const statsMap = stats.reduce<Record<string, { count: number; total: number }>>((acc, o) => {
    if (!o.customer_id) return acc
    if (!acc[o.customer_id]) acc[o.customer_id] = { count: 0, total: 0 }
    acc[o.customer_id].count++
    acc[o.customer_id].total += Number(o.total)
    return acc
  }, {})

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q)
  })

  async function handleDelete(c: Customer) {
    if (!confirm(`Excluir o cliente "${c.name}"?`)) return
    await supabase.from('customers').delete().eq('id', c.id)
    queryClient.invalidateQueries({ queryKey: ['customers'] })
  }

  function openEdit(c: Customer) {
    setEditCustomer(c)
    setShowForm(true)
  }

  function formatBirthday(dateStr: string | null) {
    if (!dateStr) return null
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }

  function age(dateStr: string | null) {
    if (!dateStr) return null
    const b = new Date(dateStr + 'T00:00:00')
    const today = new Date()
    let age = today.getFullYear() - b.getFullYear()
    if (today.getMonth() < b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate())) age--
    return age
  }

  const reload = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['customers'] })
    queryClient.invalidateQueries({ queryKey: ['customers-stats'] })
  }, [queryClient])

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Clientes</h2>
          <p className="text-muted-foreground text-sm mt-0.5">{customers.length} cliente{customers.length !== 1 ? 's' : ''} cadastrado{customers.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Importar
          </Button>
          <Button onClick={() => { setEditCustomer(null); setShowForm(true) }}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Cliente
          </Button>
        </div>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou celular..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Vazio */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Users className="w-14 h-14 opacity-30" />
          <p>{search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}</p>
        </div>
      )}

      {/* Lista */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((c) => {
            const s = statsMap[c.id]
            const a = age(c.birthday)
            return (
              <div key={c.id} className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow">
                {/* Avatar inicial */}
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{c.name}</span>
                    {c.phone_verified
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" aria-label="Celular verificado" />
                      : <XCircle className="w-3.5 h-3.5 text-muted-foreground" aria-label="Não verificado" />}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {c.phone && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        {c.phone_ddi} {c.phone}
                      </span>
                    )}
                    {c.birthday && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Cake className="w-3 h-3" />
                        {formatBirthday(c.birthday)}{a !== null ? ` (${a} anos)` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Estatísticas */}
                {s && (
                  <div className="hidden sm:flex flex-col items-end text-xs text-muted-foreground shrink-0">
                    <span className="flex items-center gap-1">
                      <ShoppingBag className="w-3 h-3" />
                      {s.count} visita{s.count !== 1 ? 's' : ''}
                    </span>
                    <span className="font-semibold text-foreground">{formatCurrency(s.total)}</span>
                  </div>
                )}

                {/* Ações */}
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(c)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ClienteFormModal
        open={showForm}
        customer={editCustomer}
        onClose={() => { setShowForm(false); setEditCustomer(null) }}
        onSaved={reload}
      />

      <ImportXlsxModal
        open={importOpen}
        config={clientesImportConfig}
        onClose={() => setImportOpen(false)}
        onImported={reload}
      />
    </div>
  )
}
