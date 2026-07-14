import { useEffect, useState, FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Plus, Pencil, Trash2, Phone, Mail, Eye, EyeOff, ShieldCheck, UserCog, Loader2,
} from 'lucide-react'
import { applyPhoneMask } from '@/components/admin/freelancers/FreelancerFormModal'
import { createUser, updateUser, deleteUser } from '@/lib/users'
import { ROLE_LABELS, type Profile, type Role } from '@/types/database'

const ROLE_DESCRICAO: Record<Role, string> = {
  admin: 'Acesso total ao sistema',
  atendente: 'Clientes e Comandas (sem excluir itens)',
  cozinha: 'Fila de preparos da cozinha',
  bar: 'Fila de preparos do bar',
  caixa: 'Comandas, Notas Fiscais e Marketing',
}

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-primary/10 text-primary',
  atendente: 'bg-blue-100 text-blue-800',
  cozinha: 'bg-amber-100 text-amber-800',
  bar: 'bg-purple-100 text-purple-800',
  caixa: 'bg-green-100 text-green-800',
}

// ── Modal ────────────────────────────────────────────────────────────────────

function UsuarioFormModal({ open, usuario, onClose, onSaved }: {
  open: boolean; usuario: Profile | null; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('atendente')
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setError(''); setShowPass(false); setPassword('')
      if (usuario) {
        setName(usuario.name)
        setPhone(usuario.phone ? applyPhoneMask(usuario.phone) : '')
        setEmail(usuario.email ?? '')
        setRole(usuario.role)
      } else {
        setName(''); setPhone(''); setEmail(''); setRole('atendente')
      }
    }
  }, [open, usuario])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Informe o nome.'); return }
    if (!email.trim()) { setError('Informe o e-mail.'); return }
    if (!usuario && password.length < 6) { setError('A senha deve ter ao menos 6 caracteres.'); return }
    if (usuario && password && password.length < 6) { setError('A nova senha deve ter ao menos 6 caracteres.'); return }

    setSaving(true)
    const res = usuario
      ? await updateUser(usuario.id, {
          name: name.trim(), phone: phone.replace(/\D/g, '') || undefined,
          email: email.trim(), role, ...(password ? { password } : {}),
        })
      : await createUser({
          name: name.trim(), email: email.trim(), password, role,
          phone: phone.replace(/\D/g, '') || undefined,
        })
    setSaving(false)
    if (res.error) { setError(res.error); return }
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{usuario ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do usuário" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(applyPhoneMask(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" maxLength={15} />
            </div>
            <div className="space-y-1.5">
              <Label>Nível de acesso *</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">{ROLE_DESCRICAO[role]}</p>

          <div className="space-y-1.5">
            <Label>E-mail *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@email.com" />
          </div>
          <div className="space-y-1.5">
            <Label>{usuario ? 'Nova senha' : 'Senha *'}</Label>
            <div className="relative">
              <Input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={usuario ? 'Deixe em branco para manter' : 'Mínimo 6 caracteres'}
                className="pr-10"
              />
              <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Salvando...</> : (usuario ? 'Salvar' : 'Criar Usuário')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Lista ────────────────────────────────────────────────────────────────────

export function UsuariosManagement() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState<Profile | null>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['system-users'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').order('name')
      return (data ?? []) as Profile[]
    },
  })

  const reload = () => queryClient.invalidateQueries({ queryKey: ['system-users'] })

  async function toggleActive(u: Profile) {
    await updateUser(u.id, { active: !u.active })
    reload()
  }

  async function handleDelete(u: Profile) {
    if (u.id === user?.id) { alert('Você não pode excluir o próprio usuário.'); return }
    if (!confirm(`Excluir o usuário "${u.name}"? Esta ação não pode ser desfeita.`)) return
    const res = await deleteUser(u.id)
    if (res.error) { alert(res.error); return }
    reload()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Usuários</h2>
          <p className="text-muted-foreground text-sm mt-0.5">{users.length} usuário{users.length !== 1 ? 's' : ''} do sistema</p>
        </div>
        <Button onClick={() => { setEditUser(null); setShowForm(true) }}>
          <Plus className="w-4 h-4 mr-2" /> Novo Usuário
        </Button>
      </div>

      {isLoading && <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}</div>}

      {!isLoading && (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                {u.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{u.name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${ROLE_BADGE[u.role]}`}>
                    {u.role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <UserCog className="w-3 h-3" />}
                    {ROLE_LABELS[u.role]}
                  </span>
                  {!u.active && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-muted-foreground">
                  {u.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{u.email}</span>}
                  {u.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{applyPhoneMask(u.phone)}</span>}
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">Ativo</span>
                <Switch checked={u.active} onCheckedChange={() => toggleActive(u)} disabled={u.id === user?.id} />
              </div>

              <div className="flex gap-1.5 shrink-0">
                <Button size="sm" variant="outline" title="Editar" onClick={() => { setEditUser(u); setShowForm(true) }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm" variant="outline"
                  className="text-destructive hover:text-destructive"
                  title="Excluir"
                  disabled={u.id === user?.id}
                  onClick={() => handleDelete(u)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <UsuarioFormModal
        open={showForm}
        usuario={editUser}
        onClose={() => { setShowForm(false); setEditUser(null) }}
        onSaved={reload}
      />
    </div>
  )
}
