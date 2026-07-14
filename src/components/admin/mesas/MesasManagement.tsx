import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Plus, Table2, Users, Clock, ChefHat,
  MoreVertical, CheckCircle2, Pencil, Trash2, RotateCcw, User, Printer,
} from 'lucide-react'
import { imprimirComanda } from '@/lib/printComanda'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { supabase } from '@/integrations/supabase/client'
import { formatCurrency, cn } from '@/lib/utils'
import type { Table, Order } from '@/types/database'
import { MesaFormModal } from './MesaFormModal'
import { AbrirMesaModal } from './AbrirMesaModal'
import { PedidoDrawer } from './PedidoDrawer'

interface TableWithOrder extends Table {
  activeOrder?: Order & { profiles?: { name: string }; customer_name?: string | null }
}

type Filter = 'all' | 'free' | 'occupied' | 'reserved'

const STATUS_CONFIG = {
  free:     { label: 'Livre',     color: 'border-green-300 bg-green-50',  badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  occupied: { label: 'Ocupada',   color: 'border-amber-300 bg-amber-50',  badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  reserved: { label: 'Reservada', color: 'border-blue-300 bg-blue-50',    badge: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500' },
}

function timeElapsed(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (diff < 60) return `${diff}min`
  return `${Math.floor(diff / 60)}h ${diff % 60}min`
}

export function MesasManagement() {
  const [tables, setTables] = useState<TableWithOrder[]>([])
  const [loading, setLoading] = useState(true)

  // Modais
  const [showForm, setShowForm] = useState(false)
  const [editTable, setEditTable] = useState<Table | null>(null)
  const [showAbrir, setShowAbrir] = useState(false)
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null)
  const [showDrawer, setShowDrawer] = useState(false)

  const [filter, setFilter] = useState<Filter>('all')

  const loadTables = useCallback(async () => {
    // Carrega mesas com pedidos abertos
    const { data: tablesData } = await supabase
      .from('tables')
      .select('*')
      .order('number')

    const { data: ordersData } = await supabase
      .from('orders')
      .select('*, profiles(*), order_items(*)')
      .eq('status', 'open')

    const merged: TableWithOrder[] = (tablesData ?? []).map((t) => ({
      ...t,
      activeOrder: (ordersData ?? []).find((o) => o.table_id === t.id) as TableWithOrder['activeOrder'],
    }))

    setTables(merged)
    setLoading(false)
  }, [])

  useEffect(() => { loadTables() }, [loadTables])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('mesas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, loadTables)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadTables)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, loadTables)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadTables])

  async function handleDeleteTable(table: Table) {
    if (table.status !== 'free') {
      alert('Só é possível excluir comandas que estejam livres.')
      return
    }
    if (!confirm(`Excluir Comanda ${table.number}?`)) return
    await supabase.from('tables').delete().eq('id', table.id)
    loadTables()
  }

  async function handleReserve(table: Table) {
    await supabase.from('tables').update({ status: 'reserved' }).eq('id', table.id)
    loadTables()
  }

  async function handleFree(table: Table) {
    await supabase.from('tables').update({ status: 'free' }).eq('id', table.id)
    loadTables()
  }

  function openOrder(table: TableWithOrder) {
    if (table.activeOrder) {
      setActiveOrderId(table.activeOrder.id)
      setShowDrawer(true)
    } else {
      setSelectedTable(table)
      setShowAbrir(true)
    }
  }

  const nextNumber = Math.max(0, ...tables.map((t) => t.number)) + 1

  const filtered = tables.filter((t) => filter === 'all' || t.status === filter)

  const counts = {
    total: tables.length,
    free: tables.filter((t) => t.status === 'free').length,
    occupied: tables.filter((t) => t.status === 'occupied').length,
    reserved: tables.filter((t) => t.status === 'reserved').length,
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Comandas</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {counts.occupied} ocupada{counts.occupied !== 1 ? 's' : ''} · {counts.free} livre{counts.free !== 1 ? 's' : ''} · {counts.reserved} reservada{counts.reserved !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => { setEditTable(null); setShowForm(true) }}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Comanda
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: 'all', label: `Todas (${counts.total})` },
          { key: 'free', label: `Livres (${counts.free})` },
          { key: 'occupied', label: `Ocupadas (${counts.occupied})` },
          { key: 'reserved', label: `Reservadas (${counts.reserved})` },
        ] as { key: Filter; label: string }[]).map(({ key, label }) => (
          <Button
            key={key}
            variant={filter === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Grid de mesas */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-44 rounded-xl border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Table2 className="w-14 h-14 opacity-30" />
          <p>Nenhuma comanda encontrada</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((table) => (
            <MesaCard
              key={table.id}
              table={table}
              onOpen={() => openOrder(table)}
              onEdit={() => { setEditTable(table); setShowForm(true) }}
              onDelete={() => handleDeleteTable(table)}
              onReserve={() => handleReserve(table)}
              onFree={() => handleFree(table)}
            />
          ))}
        </div>
      )}

      {/* Modais */}
      <MesaFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={loadTables}
        table={editTable}
        nextNumber={nextNumber}
      />
      <AbrirMesaModal
        open={showAbrir}
        onClose={() => setShowAbrir(false)}
        table={selectedTable}
        onOpened={(orderId) => {
          loadTables()
          setActiveOrderId(orderId)
          setShowDrawer(true)
        }}
      />
      <PedidoDrawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        orderId={activeOrderId}
        onUpdated={loadTables}
      />
    </div>
  )
}

interface MesaCardProps {
  table: TableWithOrder
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
  onReserve: () => void
  onFree: () => void
}

function MesaCard({ table, onOpen, onEdit, onDelete, onReserve, onFree }: MesaCardProps) {
  const cfg = STATUS_CONFIG[table.status]
  const order = table.activeOrder

  return (
    <Card
      className={cn(
        'border-2 cursor-pointer transition-all hover:shadow-md group relative',
        cfg.color
      )}
      onClick={onOpen}
    >
      {/* Menu de opções */}
      <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1.5 rounded-md bg-black/5 hover:bg-black/10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="w-4 h-4 mr-2" /> Editar comanda
            </DropdownMenuItem>
            {table.status === 'free' && (
              <DropdownMenuItem onClick={onReserve}>
                <CheckCircle2 className="w-4 h-4 mr-2" /> Marcar reservada
              </DropdownMenuItem>
            )}
            {table.status === 'reserved' && (
              <DropdownMenuItem onClick={onFree}>
                <RotateCcw className="w-4 h-4 mr-2" /> Liberar comanda
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
              disabled={table.status !== 'free'}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CardContent className="p-4 flex flex-col gap-3">
        {/* Número e nome */}
        <div>
          <div className="flex items-start gap-2">
            <span className="text-2xl font-bold leading-none">{table.number}</span>
            <span className={cn('mt-0.5 inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium', cfg.badge)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
              {cfg.label}
            </span>
          </div>
          {table.name && (
            <p className="text-xs text-muted-foreground mt-0.5">{table.name}</p>
          )}
        </div>


        {/* Informações do pedido ativo */}
        {order && (
          <div className="space-y-1.5 pt-1 border-t border-black/10">
            {order.customer_name && (
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <User className="w-3.5 h-3.5 text-amber-700" />
                <span className="truncate">{order.customer_name}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{order.people_count} pessoa{order.people_count > 1 ? 's' : ''}</span>
            </div>
            {order.profiles?.name && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ChefHat className="w-3.5 h-3.5" />
                <span className="truncate">{order.profiles.name}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>{timeElapsed(order.created_at)}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-muted-foreground">
                {order.order_items?.length ?? 0} item{(order.order_items?.length ?? 0) !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  title="Imprimir comanda"
                  onClick={(e) => {
                    e.stopPropagation()
                    imprimirComanda({
                      numero: table.number,
                      cliente: order.customer_name,
                      data: order.created_at,
                      aberta: true,
                      items: (order.order_items ?? []).map((i) => ({ quantity: i.quantity, product_name: i.product_name, unit_price: i.unit_price })),
                      total: Number(order.total),
                    })
                  }}
                  disabled={(order.order_items?.length ?? 0) === 0}
                  className="text-muted-foreground hover:text-amber-700 disabled:opacity-40 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-amber-700">
                  {formatCurrency(order.total)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-auto">
          {table.status === 'free' && (
            <div className="text-xs text-center text-green-700 font-medium opacity-100 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity">
              Clique para abrir
            </div>
          )}
          {table.status === 'occupied' && (
            <div className="text-xs text-center text-amber-700 font-medium opacity-100 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity">
              Ver pedido →
            </div>
          )}
          {table.status === 'reserved' && (
            <div className="text-xs text-center text-blue-700 font-medium opacity-100 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity">
              Reservada
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
