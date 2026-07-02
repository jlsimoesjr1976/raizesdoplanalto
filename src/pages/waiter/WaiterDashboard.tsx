import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { LogOut, UtensilsCrossed, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TableData {
  number: number
  status: 'free' | 'occupied'
  guests?: number
  openedAt?: string
}

const STATIC_TABLES: TableData[] = [
  { number: 1, status: 'occupied', guests: 2, openedAt: '18:30' },
  { number: 2, status: 'free' },
  { number: 3, status: 'occupied', guests: 4, openedAt: '19:00' },
  { number: 4, status: 'occupied', guests: 3, openedAt: '19:15' },
  { number: 5, status: 'free' },
  { number: 6, status: 'free' },
  { number: 7, status: 'occupied', guests: 6, openedAt: '18:45' },
  { number: 8, status: 'free' },
  { number: 9, status: 'occupied', guests: 2, openedAt: '19:30' },
  { number: 10, status: 'free' },
]

export default function WaiterDashboard() {
  const { profile, signOut } = useAuth()
  const [tables, setTables] = useState<TableData[]>(STATIC_TABLES)
  const [selectedTable, setSelectedTable] = useState<TableData | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  function handleTableClick(table: TableData) {
    setSelectedTable(table)
    setDialogOpen(true)
  }

  function handleOpenTable() {
    if (!selectedTable) return
    setTables((prev) =>
      prev.map((t) =>
        t.number === selectedTable.number
          ? { ...t, status: 'occupied', guests: 1, openedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
          : t
      )
    )
    setDialogOpen(false)
  }

  const occupied = tables.filter((t) => t.status === 'occupied').length

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-[hsl(145,60%,28%)] text-white shadow-md">
        <div className="flex items-center justify-between px-4 py-3 max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-[hsl(38,90%,70%)]" />
            <div>
              <h1 className="font-bold text-base leading-tight">Raízes do Planalto</h1>
              <p className="text-xs text-white/70">Garçom: {profile?.name ?? 'Usuário'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="bg-white/20 text-white border-0 hover:bg-white/30">
              {occupied} / {tables.length} ocupadas
            </Badge>
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

      <main className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-foreground">Mapa de Mesas</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Toque em uma mesa para gerenciá-la
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {tables.map((table) => (
            <button
              key={table.number}
              onClick={() => handleTableClick(table)}
              className={cn(
                'relative flex flex-col items-center justify-center rounded-2xl border-2 p-4 h-28 sm:h-32 font-medium transition-all duration-200 shadow-sm hover:shadow-md active:scale-95',
                table.status === 'free'
                  ? 'border-[hsl(145,60%,28%)] bg-[hsl(145,60%,95%)] text-[hsl(145,60%,25%)] hover:bg-[hsl(145,60%,90%)]'
                  : 'border-amber-500 bg-amber-50 text-amber-800 hover:bg-amber-100'
              )}
            >
              <span className="text-3xl font-bold">{table.number}</span>
              <span className="text-xs mt-1">
                {table.status === 'free' ? 'Livre' : `${table.guests} pessoa${(table.guests ?? 1) > 1 ? 's' : ''}`}
              </span>
              {table.status === 'occupied' && table.openedAt && (
                <span className="text-[10px] text-amber-600 mt-0.5">desde {table.openedAt}</span>
              )}
              <div
                className={cn(
                  'absolute top-2 right-2 w-2.5 h-2.5 rounded-full',
                  table.status === 'free' ? 'bg-[hsl(145,60%,45%)]' : 'bg-amber-500'
                )}
              />
            </button>
          ))}
        </div>

        <div className="mt-8 flex gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[hsl(145,60%,45%)]" />
            <span>Livre</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span>Ocupada</span>
          </div>
        </div>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Mesa {selectedTable?.number}
            </DialogTitle>
          </DialogHeader>

          {selectedTable?.status === 'occupied' ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pessoas:</span>
                  <span className="font-medium">{selectedTable.guests}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Aberta às:</span>
                  <span className="font-medium">{selectedTable.openedAt}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="secondary">Ocupada</Badge>
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full gap-2" onClick={() => setDialogOpen(false)}>
                  <ClipboardList className="w-4 h-4" />
                  Ver Pedidos
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Esta mesa está livre. Deseja abri-la para um novo atendimento?
              </p>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleOpenTable}>
                  Abrir Mesa
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
