import { useState } from 'react'
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
  Megaphone,
  Settings,
  Menu,
  X,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import logoImg from '@/assets/logo.png'
import InsumosManagement from '@/components/admin/InsumosManagement'
import { CardapioManagement } from '@/components/admin/CardapioManagement'
import { MesasManagement } from '@/components/admin/mesas/MesasManagement'
import { ConfiguracoesManagement } from '@/components/admin/ConfiguracoesManagement'
import { ClientesManagement } from '@/components/admin/clientes/ClientesManagement'
import { FreelancersManagement } from '@/components/admin/freelancers/FreelancersManagement'
import { DashboardOverview } from '@/components/admin/DashboardOverview'

type Tab =
  | 'dashboard'
  | 'menu'
  | 'orders'
  | 'tables'
  | 'stock'
  | 'customers'
  | 'freelancers'
  | 'marketing'
  | 'settings'

const NAV_ITEMS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'menu', label: 'Cardápio', icon: UtensilsCrossed },
  { id: 'orders', label: 'Pedidos', icon: ClipboardList },
  { id: 'tables', label: 'Mesas', icon: Table2 },
  { id: 'stock', label: 'Insumos', icon: Package },
  { id: 'customers', label: 'Clientes', icon: Users },
  { id: 'freelancers', label: 'Freelancers', icon: BriefcaseBusiness },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'settings', label: 'Configurações', icon: Settings },
]

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
  const { profile, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const activeItem = NAV_ITEMS.find((i) => i.id === activeTab)!

  function renderContent() {
    if (activeTab === 'dashboard') return <DashboardOverview />
    if (activeTab === 'stock') return <InsumosManagement />
    if (activeTab === 'menu') return <CardapioManagement />
    if (activeTab === 'tables') return <MesasManagement />
    if (activeTab === 'customers') return <ClientesManagement />
    if (activeTab === 'freelancers') return <FreelancersManagement />
    if (activeTab === 'settings') return <ConfiguracoesManagement />
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
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id)
                setSidebarOpen(false)
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                activeTab === item.id
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
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
              <p className="text-xs text-white/60">Admin</p>
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
