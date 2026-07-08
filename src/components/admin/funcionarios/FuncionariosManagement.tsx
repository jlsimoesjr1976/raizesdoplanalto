import { useEffect, useState, FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Plus, Search, Pencil, Trash2, Phone, IdCard, Users,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  applyCpfMask, applyPhoneMask,
} from '@/components/admin/freelancers/FreelancerFormModal'
import type { Employee } from '@/types/database'

// ── Formulário ──────────────────────────────────────────────────────────────

interface FormProps {
  open: boolean
  employee: Employee | null
  onClose: () => void
  onSaved: () => void
}

function FuncionarioFormModal({ open, employee, onClose, onSaved }: FormProps) {
  const [name, setName] = useState('')
  const [cpf, setCpf] = useState('')
  const [phone, setPhone] = useState('')
  const [position, setPosition] = useState('')
  const [salary, setSalary] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setError('')
      if (employee) {
        setName(employee.name)
        setCpf(employee.cpf ? applyCpfMask(employee.cpf) : '')
        setPhone(employee.phone ? applyPhoneMask(employee.phone) : '')
        setPosition(employee.position ?? '')
        setSalary(employee.salary !== null ? String(employee.salary) : '')
      } else {
        setName(''); setCpf(''); setPhone(''); setPosition(''); setSalary('')
      }
    }
  }, [open, employee])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('O nome é obrigatório.'); return }
    const cpfDigits = cpf.replace(/\D/g, '')
    if (cpfDigits && cpfDigits.length !== 11) { setError('CPF inválido — informe os 11 dígitos.'); return }

    setSaving(true)
    const payload = {
      name: name.trim(),
      cpf: cpfDigits || null,
      phone: phone.replace(/\D/g, '') || null,
      position: position.trim() || null,
      salary: salary ? Number(salary) : null,
    }
    const { error: err } = employee
      ? await supabase.from('employees').update(payload).eq('id', employee.id)
      : await supabase.from('employees').insert(payload)
    setSaving(false)
    if (err) { setError('Erro ao salvar: ' + err.message); return }
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{employee ? 'Editar Funcionário' : 'Novo Funcionário'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="emp-name">Nome *</Label>
            <Input id="emp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="emp-cpf">CPF</Label>
              <Input id="emp-cpf" value={cpf} onChange={(e) => setCpf(applyCpfMask(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-phone">Celular</Label>
              <Input id="emp-phone" value={phone} onChange={(e) => setPhone(applyPhoneMask(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" maxLength={15} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="emp-position">Cargo</Label>
              <Input id="emp-position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Ex: Cozinheiro" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-salary">Salário (R$)</Label>
              <Input id="emp-salary" type="number" min={0} step="0.01" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="0,00" />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Listagem ────────────────────────────────────────────────────────────────

export function FuncionariosManagement() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null)

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase.from('employees').select('*').order('name')
      if (error) throw error
      return data as Employee[]
    },
  })

  const filtered = employees.filter((f) => {
    const q = search.toLowerCase()
    return (
      f.name.toLowerCase().includes(q) ||
      (f.cpf ?? '').includes(q.replace(/\D/g, '') || '§') ||
      (f.position ?? '').toLowerCase().includes(q)
    )
  })

  async function handleDelete(f: Employee) {
    if (!confirm(`Tem certeza que deseja excluir o funcionário "${f.name}"?\n\nEsta ação não pode ser desfeita.`)) return
    await supabase.from('employees').delete().eq('id', f.id)
    queryClient.invalidateQueries({ queryKey: ['employees'] })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Funcionários</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {employees.length} funcionário{employees.length !== 1 ? 's' : ''} cadastrado{employees.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => { setEditEmployee(null); setShowForm(true) }}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Funcionário
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, CPF ou cargo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Users className="w-14 h-14 opacity-30" />
          <p>{search ? 'Nenhum funcionário encontrado' : 'Nenhum funcionário cadastrado'}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((f) => (
            <div key={f.id} className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                {f.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{f.name}</span>
                  {f.position && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium">
                      {f.position}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-muted-foreground">
                  {f.cpf && (
                    <span className="flex items-center gap-1">
                      <IdCard className="w-3 h-3" />
                      {applyCpfMask(f.cpf)}
                    </span>
                  )}
                  {f.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {applyPhoneMask(f.phone)}
                    </span>
                  )}
                </div>
              </div>
              {f.salary !== null && (
                <div className="hidden sm:block text-right shrink-0">
                  <p className="text-xs text-muted-foreground">Salário</p>
                  <p className="font-semibold">{formatCurrency(Number(f.salary))}</p>
                </div>
              )}
              <div className="flex gap-1.5 shrink-0">
                <Button size="sm" variant="outline" title="Editar" onClick={() => { setEditEmployee(f); setShowForm(true) }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  title="Excluir"
                  onClick={() => handleDelete(f)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <FuncionarioFormModal
        open={showForm}
        employee={editEmployee}
        onClose={() => { setShowForm(false); setEditEmployee(null) }}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['employees'] })}
      />
    </div>
  )
}
