import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChefHat, Clock, CheckCircle2, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KitchenStatus } from '@/types/database'

interface KitchenItem {
  id: string
  tableNumber: number
  productName: string
  quantity: number
  notes: string | null
  status: KitchenStatus
  createdAt: string
}

const STATIC_ITEMS: KitchenItem[] = [
  {
    id: '1',
    tableNumber: 1,
    productName: 'Feijoada Completa',
    quantity: 2,
    notes: 'Sem couve para um deles',
    status: 'pending',
    createdAt: new Date(Date.now() - 8 * 60000).toISOString(),
  },
  {
    id: '2',
    tableNumber: 3,
    productName: 'Frango Caipira Assado',
    quantity: 1,
    notes: null,
    status: 'preparing',
    createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
  },
  {
    id: '3',
    tableNumber: 3,
    productName: 'Arroz com Pequi',
    quantity: 1,
    notes: 'Bem temperado',
    status: 'pending',
    createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
  },
  {
    id: '4',
    tableNumber: 4,
    productName: 'Baião de Dois',
    quantity: 3,
    notes: null,
    status: 'preparing',
    createdAt: new Date(Date.now() - 22 * 60000).toISOString(),
  },
  {
    id: '5',
    tableNumber: 7,
    productName: 'Moqueca de Peixe',
    quantity: 2,
    notes: 'Acompanha pirão',
    status: 'pending',
    createdAt: new Date(Date.now() - 3 * 60000).toISOString(),
  },
  {
    id: '6',
    tableNumber: 9,
    productName: 'Carne de Sol com Macaxeira',
    quantity: 1,
    notes: null,
    status: 'ready',
    createdAt: new Date(Date.now() - 30 * 60000).toISOString(),
  },
]

function useElapsedTime(createdAt: string) {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    function update() {
      const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
      if (diff < 60) {
        setElapsed(`${diff}s`)
      } else {
        const m = Math.floor(diff / 60)
        const s = diff % 60
        setElapsed(`${m}m ${s}s`)
      }
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [createdAt])

  return elapsed
}

function KitchenCard({
  item,
  onStart,
  onDone,
}: {
  item: KitchenItem
  onStart: (id: string) => void
  onDone: (id: string) => void
}) {
  const elapsed = useElapsedTime(item.createdAt)
  const elapsedMinutes = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 60000)
  const isUrgent = elapsedMinutes >= 15 && item.status !== 'ready'

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border-2 p-4 gap-3 transition-all',
        item.status === 'pending' && 'border-zinc-600 bg-zinc-800',
        item.status === 'preparing' && 'border-amber-500 bg-amber-950/50',
        item.status === 'ready' && 'border-green-500 bg-green-950/50',
        isUrgent && item.status === 'pending' && 'border-red-500 animate-pulse'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-white">Mesa {item.tableNumber}</span>
          {isUrgent && <Flame className="w-4 h-4 text-red-400 shrink-0" />}
        </div>
        <Badge
          className={cn(
            'text-xs border-0 shrink-0',
            item.status === 'pending' && 'bg-zinc-600 text-zinc-200',
            item.status === 'preparing' && 'bg-amber-500 text-amber-950',
            item.status === 'ready' && 'bg-green-500 text-green-950'
          )}
        >
          {item.status === 'pending' && 'Aguardando'}
          {item.status === 'preparing' && 'Preparando'}
          {item.status === 'ready' && 'Pronto'}
        </Badge>
      </div>

      <div>
        <p className="text-white font-semibold text-lg leading-tight">{item.productName}</p>
        <p className="text-zinc-400 text-sm">Qtd: {item.quantity}</p>
        {item.notes && (
          <p className="text-amber-300 text-xs mt-1 italic">Obs: {item.notes}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
        <Clock className="w-3 h-3" />
        <span className={cn(isUrgent && 'text-red-400 font-bold')}>{elapsed}</span>
      </div>

      <div className="flex gap-2 mt-auto pt-1">
        {item.status === 'pending' && (
          <Button
            size="sm"
            className="flex-1 bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold"
            onClick={() => onStart(item.id)}
          >
            Iniciar
          </Button>
        )}
        {item.status === 'preparing' && (
          <Button
            size="sm"
            className="flex-1 bg-green-500 hover:bg-green-400 text-green-950 font-bold gap-1"
            onClick={() => onDone(item.id)}
          >
            <CheckCircle2 className="w-4 h-4" />
            Pronto
          </Button>
        )}
        {item.status === 'ready' && (
          <div className="flex-1 flex items-center justify-center gap-1.5 text-green-400 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Aguardando retirada
          </div>
        )}
      </div>
    </div>
  )
}

export default function KitchenDisplay() {
  const [items, setItems] = useState<KitchenItem[]>(STATIC_ITEMS)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  function handleStart(id: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'preparing' } : item))
    )
  }

  function handleDone(id: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'ready' } : item))
    )
  }

  const pending = items.filter((i) => i.status === 'pending').length
  const preparing = items.filter((i) => i.status === 'preparing').length
  const ready = items.filter((i) => i.status === 'ready').length

  const ORDER: KitchenStatus[] = ['pending', 'preparing', 'ready']
  const sorted = [...items].sort(
    (a, b) =>
      ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <header className="sticky top-0 z-10 bg-zinc-950 border-b border-zinc-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[hsl(145,60%,28%)]">
              <ChefHat className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">KDS — Cozinha</h1>
              <p className="text-xs text-zinc-400">Raízes do Planalto</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-1 rounded bg-zinc-700 text-zinc-200">
                Aguardando: <span className="font-bold text-white">{pending}</span>
              </span>
              <span className="px-2 py-1 rounded bg-amber-900/60 text-amber-300">
                Preparo: <span className="font-bold">{preparing}</span>
              </span>
              <span className="px-2 py-1 rounded bg-green-900/60 text-green-300">
                Prontos: <span className="font-bold">{ready}</span>
              </span>
            </div>
            <span className="text-zinc-400 text-sm font-mono hidden sm:block">
              {now.toLocaleTimeString('pt-BR')}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-zinc-500">
            <ChefHat className="w-16 h-16 opacity-20" />
            <p className="text-lg">Nenhum item na fila</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sorted.map((item) => (
              <KitchenCard
                key={item.id}
                item={item}
                onStart={handleStart}
                onDone={handleDone}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
