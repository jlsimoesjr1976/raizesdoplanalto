import { useState, useEffect, FormEvent } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { ClienteCombobox } from '@/components/admin/clientes/ClienteCombobox'
import { ClienteFormModal } from '@/components/admin/clientes/ClienteFormModal'
import { notifyComandaAberta } from '@/lib/comandaNotify'
import type { Table, Profile, Customer } from '@/types/database'

interface Props {
  open: boolean
  onClose: () => void
  onOpened: (orderId: string) => void
  table: Table | null
}

export function AbrirMesaModal({ open, onClose, onOpened, table }: Props) {
  const { profile } = useAuth()
  const [waiters, setWaiters] = useState<Profile[]>([])
  const [waiterId, setWaiterId] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [peopleCount, setPeopleCount] = useState('2')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Cadastro rápido de cliente inline
  const [showClienteForm, setShowClienteForm] = useState(false)
  const [newClienteName, setNewClienteName] = useState('')

  useEffect(() => {
    if (open) {
      setWaiterId(profile?.id ?? '')
      setCustomer(null)
      setPeopleCount('2')
      setNotes('')
      setError('')
      loadWaiters()
    }
  }, [open, profile])

  async function loadWaiters() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('active', true)
      .in('role', ['admin', 'waiter'])
      .order('name')
    setWaiters(data ?? [])
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!table) return
    if (!customer) { setError('Selecione o cliente responsável pela comanda'); return }
    if (!waiterId) { setError('Selecione o atendente responsável'); return }
    const count = parseInt(peopleCount)
    if (isNaN(count) || count < 1) { setError('Número de pessoas inválido'); return }

    setLoading(true)

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        table_id: table.id,
        table_number: table.number,
        waiter_id: waiterId,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone ? `${customer.phone_ddi} ${customer.phone}` : null,
        people_count: count,
        notes: notes.trim() || null,
        status: 'open',
      })
      .select()
      .single()

    if (orderErr || !order) {
      setLoading(false)
      setError(orderErr?.message ?? 'Erro ao abrir comanda')
      return
    }

    await supabase.from('tables').update({ status: 'occupied' }).eq('id', table.id)

    // Notifica o cliente pelo WhatsApp (comanda aberta)
    if (customer.phone) {
      notifyComandaAberta(`${customer.phone_ddi} ${customer.phone}`, customer.name, table.number)
    }

    setLoading(false)
    onOpened(order.id)
    onClose()
  }

  if (!table) return null

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Abrir Comanda {table.number}{table.name ? ` — ${table.name}` : ''}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">

            {/* Responsável pelo cliente — busca em clientes */}
            <div className="space-y-1.5">
              <Label>Cliente responsável *</Label>
              <ClienteCombobox
                value={customer}
                onChange={setCustomer}
                onCreateNew={(name) => { setNewClienteName(name); setShowClienteForm(true) }}
                placeholder="Buscar cliente pelo nome ou celular..."
              />
            </div>

            {/* Atendente */}
            <div className="space-y-1.5">
              <Label>Atendente *</Label>
              <Select value={waiterId} onValueChange={setWaiterId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o atendente..." />
                </SelectTrigger>
                <SelectContent>
                  {waiters.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} {w.role === 'admin' ? '(Admin)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Número de pessoas */}
            <div className="space-y-1.5">
              <Label>Número de pessoas *</Label>
              <Input
                type="number"
                min={1}
                max={99}
                value={peopleCount}
                onChange={(e) => setPeopleCount(e.target.value)}
                required
              />
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label>Observações <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input
                placeholder="Aniversário, alergia, preferências..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Abrindo...' : 'Abrir Comanda'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Cadastro rápido inline */}
      <ClienteFormModal
        open={showClienteForm}
        initialName={newClienteName}
        onClose={() => setShowClienteForm(false)}
        onSaved={(c) => { setCustomer(c); setShowClienteForm(false) }}
      />
    </>
  )
}
