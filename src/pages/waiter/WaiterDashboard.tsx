import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { LogOut, Table2, ClipboardList, RefreshCw } from 'lucide-react'
import { AbrirMesaModal } from '@/components/admin/mesas/AbrirMesaModal'
import { PedidoDrawer } from '@/components/admin/mesas/PedidoDrawer'
import logoImg from '@/assets/logo.png'
import type { Table } from '@/types/database'

type TabName = 'mesas' | 'pedidos'

export default function WaiterDashboard() {
  const { profile, signOut } = useAuth()
  const [tables, setTables] = useState<Table[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabName>('mesas')

  // Modais
  const [abrirMesa, setAbrirMesa] = useState<Table | null>(null)
  const [pedidoOrderId, setPedidoOrderId] = useState<string | null>(null)
  const [pedidoOpen, setPedidoOpen] = useState(false)

  async function loadTables() {
    const { data } = await supabase.from('tables').select('*').order('number')
    setTables(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadTables()

    const channel = supabase
      .channel('waiter-tables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => loadTables())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadTables())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function handleTableClick(table: Table) {
    if (table.status === 'free') {
      setAbrirMesa(table)
    } else if (table.status === 'occupied') {
      // Busca a comanda aberta desta mesa
      const { data: order } = await supabase
        .from('orders')
        .select('id')
        .eq('table_id', table.id)
        .eq('status', 'open')
        .single()
      if (order) {
        setPedidoOrderId(order.id)
        setPedidoOpen(true)
      }
    }
  }

  async function handleMesaAberta(orderId: string) {
    await loadTables()
    setPedidoOrderId(orderId)
    setPedidoOpen(true)
    setAbrirMesa(null)
  }

  const free = tables.filter((t) => t.status === 'free').length
  const occupied = tables.filter((t) => t.status === 'occupied').length

  // Pedidos das mesas ocupadas (para aba "Meus Pedidos")
  const myTables = tables.filter((t) => t.status === 'occupied')

  const statusColor = (status: Table['status']) => {
    if (status === 'free') return 'border-green-500 bg-green-50 text-green-800'
    if (status === 'occupied') return 'border-amber-500 bg-amber-50 text-amber-800'
    return 'border-blue-500 bg-blue-50 text-blue-800'
  }

  const statusDot = (status: Table['status']) => {
    if (status === 'free') return 'bg-green-500'
    if (status === 'occupied') return 'bg-amber-500'
    return 'bg-blue-500'
  }

  const statusLabel = (status: Table['status']) => {
    if (status === 'free') return 'Livre'
    if (status === 'occupied') return 'Ocupada'
    return 'Reservada'
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* Header fixo */}
      <header className="sticky top-0 z-10 bg-[hsl(145,60%,28%)] text-white shadow-md safe-area-top">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img src={logoImg} alt="Logo" className="w-8 h-8 rounded-full object-cover" />
            <div>
              <p className="font-bold text-sm leading-tight">Raízes do Planalto</p>
              <p className="text-xs text-white/70">{profile?.name ?? 'Garçom'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5 text-xs">
              <span className="bg-green-600/70 text-white px-2 py-0.5 rounded-full">{free} livres</span>
              <span className="bg-amber-500/80 text-white px-2 py-0.5 rounded-full">{occupied} ocupadas</span>
            </div>
            <button
              onClick={() => { setLoading(true); loadTables() }}
              className="p-2 rounded-md hover:bg-white/10 transition-colors"
              title="Atualizar"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </button>
            <button
              onClick={signOut}
              className="p-2 rounded-md hover:bg-white/10 transition-colors"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="flex-1 overflow-y-auto p-4 pb-24">

        {/* Aba Mesas */}
        {activeTab === 'mesas' && (
          <>
            <p className="text-xs text-muted-foreground mb-3">
              Toque em uma mesa para abrir ou gerenciar
            </p>

            {loading && (
              <div className="grid grid-cols-3 gap-3">
                {[...Array(9)].map((_, i) => (
                  <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
                ))}
              </div>
            )}

            {!loading && tables.length === 0 && (
              <div className="flex flex-col items-center py-16 text-muted-foreground gap-2">
                <Table2 className="w-10 h-10 opacity-30" />
                <p className="text-sm">Nenhuma mesa cadastrada</p>
              </div>
            )}

            {!loading && tables.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {tables.map((table) => (
                  <button
                    key={table.id}
                    onClick={() => handleTableClick(table)}
                    className={cn(
                      'relative flex flex-col items-center justify-center rounded-2xl border-2 p-3 h-24 font-medium transition-all duration-150 active:scale-95 shadow-sm',
                      statusColor(table.status)
                    )}
                  >
                    <span className="text-2xl font-bold">{table.number}</span>
                    {table.name && (
                      <span className="text-[10px] mt-0.5 opacity-70 truncate max-w-full px-1">{table.name}</span>
                    )}
                    <span className="text-[10px] mt-0.5">{statusLabel(table.status)}</span>
                    <div className={cn('absolute top-2 right-2 w-2 h-2 rounded-full', statusDot(table.status))} />
                  </button>
                ))}
              </div>
            )}

            {/* Legenda */}
            {!loading && (
              <div className="flex gap-4 mt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />Livre</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />Ocupada</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />Reservada</span>
              </div>
            )}
          </>
        )}

        {/* Aba Pedidos */}
        {activeTab === 'pedidos' && (
          <>
            <p className="text-xs text-muted-foreground mb-3">Mesas com comanda aberta</p>
            {myTables.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-muted-foreground gap-2">
                <ClipboardList className="w-10 h-10 opacity-30" />
                <p className="text-sm">Nenhuma mesa ocupada no momento</p>
              </div>
            ) : (
              <div className="space-y-2">
                {myTables.map((table) => (
                  <button
                    key={table.id}
                    onClick={() => handleTableClick(table)}
                    className="w-full flex items-center justify-between p-4 rounded-xl border bg-card shadow-sm active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-lg">
                        {table.number}
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-sm">Mesa {table.number}{table.name ? ` — ${table.name}` : ''}</p>
                        <p className="text-xs text-muted-foreground">Toque para ver o pedido</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-0">
                      Ocupada
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-10 bg-background border-t shadow-lg safe-area-bottom">
        <div className="grid grid-cols-2">
          <button
            onClick={() => setActiveTab('mesas')}
            className={cn(
              'flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
              activeTab === 'mesas'
                ? 'text-[hsl(145,60%,28%)]'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Table2 className={cn('w-5 h-5', activeTab === 'mesas' && 'text-[hsl(145,60%,28%)]')} />
            Mesas
            {occupied > 0 && activeTab !== 'mesas' && (
              <span className="absolute top-1 right-[calc(50%+4px)] w-4 h-4 bg-amber-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {occupied}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('pedidos')}
            className={cn(
              'flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors relative',
              activeTab === 'pedidos'
                ? 'text-[hsl(145,60%,28%)]'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ClipboardList className={cn('w-5 h-5', activeTab === 'pedidos' && 'text-[hsl(145,60%,28%)]')} />
            Pedidos
            {occupied > 0 && (
              <span className="absolute top-2 right-[calc(50%-18px)] w-4 h-4 bg-amber-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {occupied}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Modais */}
      <AbrirMesaModal
        open={!!abrirMesa}
        table={abrirMesa}
        onClose={() => setAbrirMesa(null)}
        onOpened={handleMesaAberta}
      />

      <PedidoDrawer
        open={pedidoOpen}
        orderId={pedidoOrderId}
        onClose={() => { setPedidoOpen(false); setPedidoOrderId(null); loadTables() }}
        onUpdated={loadTables}
      />
    </div>
  )
}
