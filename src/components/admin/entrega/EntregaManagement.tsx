import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, MapPin, Truck, AlertTriangle } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { DeliveryZone, DeliveryNeighborhood } from '@/types/database'

const ZONES_QK = ['delivery-zones']
const NEIGH_QK = ['delivery-neighborhoods']

export function EntregaManagement() {
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [newFee, setNewFee] = useState('')

  const { data: zones = [], isLoading: zonesLoading } = useQuery({
    queryKey: ZONES_QK,
    queryFn: async () => {
      const { data, error } = await supabase.from('delivery_zones').select('*').order('sort_order').order('name')
      if (error) throw error
      return data as DeliveryZone[]
    },
  })

  const { data: neighborhoods = [], isLoading: neighLoading } = useQuery({
    queryKey: NEIGH_QK,
    queryFn: async () => {
      const { data, error } = await supabase.from('delivery_neighborhoods').select('*, delivery_zones(*)').order('neighborhood')
      if (error) throw error
      return data as DeliveryNeighborhood[]
    },
  })

  const invalidateZones = () => queryClient.invalidateQueries({ queryKey: ZONES_QK })
  const invalidateNeigh = () => queryClient.invalidateQueries({ queryKey: NEIGH_QK })

  const addZone = useMutation({
    mutationFn: async () => {
      const fee = parseFloat(newFee.replace(',', '.'))
      if (!newName.trim() || isNaN(fee) || fee < 0) throw new Error('Informe o nome da zona e uma taxa válida.')
      const { error } = await supabase.from('delivery_zones').insert({ name: newName.trim(), fee, sort_order: zones.length })
      if (error) throw error
    },
    onSuccess: () => { setNewName(''); setNewFee(''); invalidateZones() },
    onError: (e) => alert(e instanceof Error ? e.message : String(e)),
  })

  const patchZone = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<DeliveryZone> }) => {
      const { error } = await supabase.from('delivery_zones').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidateZones(); invalidateNeigh() },
  })

  const deleteZone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('delivery_zones').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidateZones(); invalidateNeigh() },
    onError: () => alert('Não foi possível excluir. Verifique se algum bairro ainda está associado a esta zona.'),
  })

  const assignZone = useMutation({
    mutationFn: async ({ id, zoneId }: { id: string; zoneId: string | null }) => {
      const { error } = await supabase.from('delivery_neighborhoods').update({ zone_id: zoneId }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidateNeigh,
  })

  const pending = neighborhoods.filter((n) => !n.zone_id)
  const classified = neighborhoods.filter((n) => n.zone_id)

  return (
    <div className="space-y-6">
      {/* Zonas de entrega */}
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold flex items-center gap-1.5"><Truck className="w-4 h-4" /> Zonas de Entrega</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Faixas de taxa fixa por região. Associe os bairros a elas abaixo.</p>
        </div>

        <div className="flex gap-2 items-end flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Nome da zona</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Asa Sul / Cruzeiro" className="w-56" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Taxa (R$)</Label>
            <Input value={newFee} onChange={(e) => setNewFee(e.target.value)} placeholder="0,00" inputMode="decimal" className="w-28" />
          </div>
          <Button type="button" size="sm" onClick={() => addZone.mutate()} disabled={addZone.isPending}>
            <Plus className="w-4 h-4 mr-1" />
            Adicionar zona
          </Button>
        </div>

        {zonesLoading && <div className="h-24 rounded-lg bg-muted animate-pulse" />}

        {!zonesLoading && (
          <div className="border rounded-lg divide-y">
            {zones.map((z) => (
              <div key={z.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className={cn('flex-1 font-medium', !z.active && 'text-muted-foreground line-through')}>{z.name}</span>
                <span className="text-xs text-muted-foreground">
                  {neighborhoods.filter((n) => n.zone_id === z.id).length} bairro(s)
                </span>
                <Input
                  defaultValue={String(z.fee)}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value.replace(',', '.'))
                    if (!isNaN(v) && v >= 0 && v !== Number(z.fee)) patchZone.mutate({ id: z.id, patch: { fee: v } })
                  }}
                  inputMode="decimal"
                  className="w-24 h-8 text-right"
                />
                <Button type="button" size="sm" variant="outline" onClick={() => patchZone.mutate({ id: z.id, patch: { active: !z.active } })}>
                  {z.active ? 'Ativa' : 'Inativa'}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm(`Excluir a zona "${z.name}"?`)) deleteZone.mutate(z.id) }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
            {zones.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">Nenhuma zona cadastrada.</p>}
          </div>
        )}
      </div>

      {/* Bairros a classificar */}
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Bairros</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Toda vez que um cliente novo se cadastra com um bairro ainda não visto, ele aparece aqui para você definir a zona/taxa.
          </p>
        </div>

        {neighLoading && <div className="h-24 rounded-lg bg-muted animate-pulse" />}

        {!neighLoading && pending.length > 0 && (
          <div className="border-2 border-amber-300 bg-amber-50 rounded-lg divide-y divide-amber-200">
            <p className="text-xs font-semibold text-amber-800 px-3 py-1.5 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {pending.length} bairro(s) aguardando classificação
            </p>
            {pending.map((n) => (
              <div key={n.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1 font-medium">{n.neighborhood}</span>
                <span className="text-xs text-muted-foreground">{n.city}</span>
                <Select value="__none__" onValueChange={(v) => assignZone.mutate({ id: n.id, zoneId: v === '__none__' ? null : v })}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Atribuir zona..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" disabled>Selecionar zona...</SelectItem>
                    {zones.filter((z) => z.active).map((z) => (
                      <SelectItem key={z.id} value={z.id}>{z.name} — {formatCurrency(Number(z.fee))}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        {!neighLoading && classified.length > 0 && (
          <div className="border rounded-lg divide-y">
            {classified.map((n) => (
              <div key={n.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1">{n.neighborhood}</span>
                <span className="text-xs text-muted-foreground">{n.city}</span>
                <Select value={n.zone_id ?? '__none__'} onValueChange={(v) => assignZone.mutate({ id: n.id, zoneId: v === '__none__' ? null : v })}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem zona</SelectItem>
                    {zones.map((z) => (
                      <SelectItem key={z.id} value={z.id}>{z.name} — {formatCurrency(Number(z.fee))}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="text-[10px]">{n.delivery_zones?.name}</Badge>
              </div>
            ))}
          </div>
        )}

        {!neighLoading && neighborhoods.length === 0 && (
          <p className="text-sm text-muted-foreground p-4 text-center border rounded-lg">
            Nenhum bairro registrado ainda — aparecem aqui conforme os clientes se cadastram pelo cardápio.
          </p>
        )}
      </div>
    </div>
  )
}
