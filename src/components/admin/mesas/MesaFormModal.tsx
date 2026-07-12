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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setNumber(table ? String(table.number) : String(nextNumber))
      setName(table?.name ?? '')
      setError('')
    }
  }, [open, table, nextNumber])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const num = parseInt(number)
    if (isNaN(num) || num < 1) { setError('Número inválido'); return }

    setLoading(true)
    // Capacidade não é mais usada; mantém o valor existente ou um padrão para o schema
    const payload = { number: num, name: name.trim() || null, capacity: table?.capacity ?? 1 }

    const { error: err } = table
      ? await supabase.from('tables').update(payload).eq('id', table.id)
      : await supabase.from('tables').insert(payload)

    setLoading(false)
    if (err) {
      setError(err.code === '23505' ? `Comanda número ${num} já existe.` : err.message)
      return
    }
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{table ? 'Editar Comanda' : 'Nova Comanda'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Número da Comanda *</Label>
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
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : table ? 'Salvar' : 'Criar Comanda'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
