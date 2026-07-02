import { useState, useEffect, FormEvent } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/integrations/supabase/client'
import type { Table } from '@/types/database'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  table?: Table | null
  nextNumber?: number
}

export function MesaFormModal({ open, onClose, onSaved, table, nextNumber = 1 }: Props) {
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('4')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setNumber(table ? String(table.number) : String(nextNumber))
      setName(table?.name ?? '')
      setCapacity(table ? String(table.capacity) : '4')
      setError('')
    }
  }, [open, table, nextNumber])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const num = parseInt(number)
    const cap = parseInt(capacity)
    if (isNaN(num) || num < 1) { setError('Número inválido'); return }
    if (isNaN(cap) || cap < 1) { setError('Capacidade inválida'); return }

    setLoading(true)
    const payload = { number: num, name: name.trim() || null, capacity: cap }

    const { error: err } = table
      ? await supabase.from('tables').update(payload).eq('id', table.id)
      : await supabase.from('tables').insert(payload)

    setLoading(false)
    if (err) {
      setError(err.code === '23505' ? `Mesa número ${num} já existe.` : err.message)
      return
    }
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{table ? 'Editar Mesa' : 'Nova Mesa'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Número da Mesa *</Label>
            <Input
              type="number"
              min={1}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nome / Localização <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input
              placeholder="Ex: Varanda, Salão, VIP..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Capacidade (lugares) *</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : table ? 'Salvar' : 'Criar Mesa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
