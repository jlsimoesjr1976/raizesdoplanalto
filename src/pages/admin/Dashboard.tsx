import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  LayoutDashboard,
  UtensilsCrossed,
  ClipboardList,
  Table2,
  Package,
  Users,
  BriefcaseBusiness,
  Truck,
  UserCog,
  Wallet,
  Megaphone,
  Settings,
  Menu,
  X,
  LogOut,
  FolderPlus,
  ChevronDown,
  ReceiptText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import logoImg from '@/assets/logo.png'
import InsumosManagement from '@/components/admin/InsumosManagement'
import { CardapioManagement } from '@/components/admin/CardapioManagement'
import { MesasManagement } from '@/components/admin/mesas/MesasManagement'
import { ConfiguracoesManagement } from '@/components/admin/ConfiguracoesManagement'
import { ClientesManagement } from '@/components/admin/clientes/ClientesManagement'
import { FreelancersManagement } from '@/components/admin/freelancers/FreelancersManagement'
import { FinanceiroManagement } from '@/components/admin/financeiro/FinanceiroManagement'
import { FornecedoresManagement } from '@/components/admin/fornecedores/FornecedoresManagement'
import { FuncionariosManagement } from '@/components/admin/funcionarios/FuncionariosManagement'
import { MarketingManagement } from '@/components/admin/marketing/MarketingManagement'
import { NotasFiscaisManagement } from '@/components/admin/notas/NotasFiscaisManagement'
import { UsuariosManagement } from '@/components/admin/usuarios/UsuariosManagement'
import { FilaPreparoManagement } from '@/components/admin/preparo/FilaPreparoManagement'
import { DashboardOverview } from '@/components/admin/DashboardOverview'
import { ShieldCheck, ChefHat } from 'lucide-react'
import { ROLE_LABELS, type Role } from '@/types/database'

type Tab =
  | 'dashboard'
  | 'menu'
  | 'orders'
  | 'tables'
  | 'stock'
  | 'customers'
  | 'freelancers'
  | 'suppliers'
  | 'employees'
  | 'finance'
  | 'invoices'
  | 'marketing'
  | 'settings'
  | 'users'
  | 'queue'

// Abas permitidas por nível de acesso ('all' = tudo)
const ROLE_TABS: Record<Role, Tab[] | 'all'> = {
  admin: 'all',
  atendente: ['tables', 'customers'],
  caixa: ['tables', 'invoices', 'marketing'],
  cozinha: ['queue'],
  bar: ['queue'],
}

type NavItem = { id: Tab; label: string; icon: React.ElementType }

// Itens antes do grupo Cadastros
const NAV_TOP: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'orders', label: 'Pedidos', icon: ClipboardList },
  { id: 'tables', label: 'Comandas', icon: Table2 },
]

// Submenus do grupo Cadastros
const NAV_CADASTROS: NavItem[] = [
  { id: 'menu', label: 'Cardápio', icon: UtensilsCrossed },
  { id: 'stock', label: 'Insumos', icon: Package },
  { id: 'customers', label: 'Clientes', icon: Users },
  { id: 'freelancers', label: 'Freelancers', icon: BriefcaseBusiness },
  { id: 'suppliers', label: 'Fornecedores', icon: Truck },
  { id: 'employees', label: 'Funcionários', icon: UserCog },
]

// Itens após o grupo Cadastros
const NAV_BOTTOM: NavItem[] = [
  { id: 'finance', label: 'Financeiro', icon: Wallet },
  { id: 'invoices', label: 'Notas Fiscais', icon: ReceiptText },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'users', label: 'Usuários', icon: ShieldCheck },
  { id: 'settings', label: 'Configurações', icon: Settings },
]

const QUEUE_ITEM: NavItem = { id: 'queue', label: 'Fila de Preparos', icon: ChefHat }

const ALL_NAV_ITEMS: NavItem[] = [...NAV_TOP, ...NAV_CADASTROS, ...NAV_BOTTOM, QUEUE_ITEM]

function canAccess(role: Role | null, tab: Tab): boolean {
  if (!role) return false
  const allowed = ROLE_TABS[role]
  return allowed === 'all' || allowed.includes(tab)
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
        active
          ? 'bg-white/20 text-white'
          : 'text-white/70 hover:bg-white/10 hover:text-white'
      )}
    >
      <item.icon className="w-4 h-4 shrink-0" />
      {item.label}
    </button>
  )
}

function PlaceholderTab({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
      <Icon className="w-16 h-16 opacity-30" />
      <div className="text-center">
        <p className="text-lg font-medium">{label}</p>
        <p className="text-sm">Em desenvolvimento</p>
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const { profile, role, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [cadastrosOpen, setCadastrosOpen] = useState(false)

  // Menus filtrados pelo nível de acesso
  const topItems = NAV_TOP.filter((i) => canAccess(role, i.id))
  const cadastrosItems = NAV_CADASTROS.filter((i) => canAccess(role, i.id))
  const bottomItems = NAV_BOTTOM.filter((i) => canAccess(role, i.id))
  const queueVisible = role === 'cozinha' || role === 'bar' || role === 'admin'

  // Aba inicial válida para o papel
  const firstTab: Tab =
    role === 'admin' ? 'dashboard'
    : queueVisible ? 'queue'
    : (topItems[0]?.id ?? cadastrosItems[0]?.id ?? bottomItems[0]?.id ?? 'queue')

  const [activeTab, setActiveTab] = useState<Tab>(firstTab)

  // Garante que a aba ativa é permitida (após carregar o papel)
  useEffect(() => {
    if (role && !canAccess(role, activeTab)) setActiveTab(firstTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  const activeItem = ALL_NAV_ITEMS.find((i) => i.id === activeTab) ?? QUEUE_ITEM
  const cadastrosActive = NAV_CADASTROS.some((i) => i.id === activeTab)

  function renderContent() {
    if (!canAccess(role, activeTab)) return <PlaceholderTab icon={ShieldCheck} label="Sem permissão de acesso" />
    if (activeTab === 'dashboard') return <DashboardOverview />
    if (activeTab === 'stock') return <InsumosManagement />
    if (activeTab === 'menu') return <CardapioManagement />
    if (activeTab === 'tables') return <MesasManagement />
    if (activeTab === 'customers') return <ClientesManagement />
    if (activeTab === 'freelancers') return <FreelancersManagement />
    if (activeTab === 'suppliers') return <FornecedoresManagement />
    if (activeTab === 'employees') return <FuncionariosManagement />
    if (activeTab === 'finance') return <FinanceiroManagement />
    if (activeTab === 'invoices') return <NotasFiscaisManagement />
    if (activeTab === 'marketing') return <MarketingManagement />
    if (activeTab === 'settings') return <ConfiguracoesManagement />
    if (activeTab === 'users') return <UsuariosManagement />
    if (activeTab === 'queue') return <FilaPreparoManagement />
    return <PlaceholderTab icon={activeItem.icon} label={activeItem.label} />
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-[hsl(145,60%,28%)] text-white transition-transform duration-300 lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="Raízes do Planalto" className="w-8 h-8 object-contain rounded" />
            <span className="font-bold text-sm leading-tight">Raízes do Planalto</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {/* Fila de Preparos logo abaixo do Dashboard (ou no topo se não houver Dashboard) */}
          {queueVisible && !topItems.some((i) => i.id === 'dashboard') && (
            <NavButton
              item={QUEUE_ITEM}
              active={activeTab === 'queue'}
              onClick={() => { setActiveTab('queue'); setSidebarOpen(false) }}
            />
          )}

          {topItems.map((item) => (
            <div key={item.id} className="space-y-1">
              <NavButton
                item={item}
                active={activeTab === item.id}
                onClick={() => { setActiveTab(item.id); setSidebarOpen(false) }}
              />
              {queueVisible && item.id === 'dashboard' && (
                <NavButton
                  item={QUEUE_ITEM}
                  active={activeTab === 'queue'}
                  onClick={() => { setActiveTab('queue'); setSidebarOpen(false) }}
                />
              )}
            </div>
          ))}

          {/* Grupo Cadastros (colapsável) — só se houver itens permitidos */}
          {cadastrosItems.length > 0 && (
            <>
              <button
                onClick={() => setCadastrosOpen((v) => !v)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  cadastrosActive && !cadastrosOpen
                    ? 'bg-white/10 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <FolderPlus className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">Cadastros</span>
                <ChevronDown className={cn('w-4 h-4 shrink-0 transition-transform', cadastrosOpen && 'rotate-180')} />
              </button>

              {cadastrosOpen && (
                <div className="ml-3 pl-2 border-l border-white/15 space-y-1">
                  {cadastrosItems.map((item) => (
                    <NavButton
                      key={item.id}
                      item={item}
                      active={activeTab === item.id}
                      onClick={() => { setActiveTab(item.id); setSidebarOpen(false) }}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {bottomItems.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={activeTab === item.id}
              onClick={() => { setActiveTab(item.id); setSidebarOpen(false) }}
            />
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-white/20 text-white text-xs">
                {profile?.name?.slice(0, 2).toUpperCase() ?? 'AD'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.name ?? 'Administrador'}</p>
              <p className="text-xs text-white/60">{role ? ROLE_LABELS[role] : ''}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start text-white/70 hover:text-white hover:bg-white/10 gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center gap-4 px-4 py-3 border-b bg-background shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-md hover:bg-muted"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <activeItem.icon className="w-5 h-5 text-primary" />
            <h1 className="font-semibold text-foreground">{activeItem.label}</h1>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}
