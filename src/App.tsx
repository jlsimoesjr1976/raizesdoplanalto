import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { Toaster } from '@/components/ui/toaster'
import Login from '@/pages/Login'
import NotFound from '@/pages/NotFound'
import type { Role } from '@/types/database'

// Code splitting: o cardápio do cliente e o painel admin são bundles
// separados — o cliente no celular não baixa o código do admin (nem
// xlsx/jspdf/recharts) e vice-versa.
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'))
const Cardapio = lazy(() => import('@/pages/Cardapio'))

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

function getRoleRoute(_role: Role): string {
  // Todos os níveis usam o mesmo shell; o menu é filtrado por papel.
  return '/admin'
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user, role, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      {/* Cardápio público para clientes (independente do login de staff) */}
      <Route path="/cardapio" element={<Cardapio />} />
      <Route
        path="/"
        element={
          user && role ? <Navigate to={getRoleRoute(role)} replace /> : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/login"
        element={
          user && role ? <Navigate to={getRoleRoute(role)} replace /> : <Login />
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="/waiter" element={<Navigate to="/admin" replace />} />
      <Route path="/kitchen" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
