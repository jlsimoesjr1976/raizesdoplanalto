import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { Toaster } from '@/components/ui/toaster'
import Login from '@/pages/Login'
import NotFound from '@/pages/NotFound'
import AdminDashboard from '@/pages/admin/Dashboard'
import WaiterDashboard from '@/pages/waiter/WaiterDashboard'
import KitchenDisplay from '@/pages/kitchen/KitchenDisplay'
import type { Role } from '@/types/database'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

function getRoleRoute(role: Role): string {
  if (role === 'admin') return '/admin'
  if (role === 'waiter') return '/waiter'
  if (role === 'kitchen') return '/kitchen'
  return '/login'
}

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole: Role
}

function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, role, isLoading } = useAuth()

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

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (role && role !== requiredRole) {
    return <Navigate to={getRoleRoute(role)} replace />
  }

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
    <Routes>
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
          <ProtectedRoute requiredRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/waiter"
        element={
          <ProtectedRoute requiredRole="waiter">
            <WaiterDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kitchen"
        element={
          <ProtectedRoute requiredRole="kitchen">
            <KitchenDisplay />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
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
