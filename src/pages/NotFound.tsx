import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Home, AlertTriangle } from 'lucide-react'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <div className="flex items-center justify-center w-24 h-24 rounded-full bg-muted">
            <AlertTriangle className="w-12 h-12 text-muted-foreground" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-8xl font-bold text-primary">404</h1>
          <h2 className="text-2xl font-semibold text-foreground">Página não encontrada</h2>
          <p className="text-muted-foreground">
            A página que você está procurando não existe ou foi removida.
          </p>
        </div>
        <Button
          onClick={() => navigate('/')}
          className="gap-2"
        >
          <Home className="w-4 h-4" />
          Voltar ao início
        </Button>
      </div>
    </div>
  )
}
