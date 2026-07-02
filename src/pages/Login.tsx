import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Lock, Mail } from 'lucide-react'
import logoImg from '@/assets/logo.png'

export default function Login() {
  const { signIn, role, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function getRoleRoute(r: string | null) {
    if (r === 'admin') return '/admin'
    if (r === 'waiter') return '/waiter'
    if (r === 'kitchen') return '/kitchen'
    return '/login'
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login. Verifique suas credenciais.')
      setLoading(false)
      return
    }
    setLoading(false)
  }

  if (!authLoading && role) {
    navigate(getRoleRoute(role), { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img
            src={logoImg}
            alt="Raízes do Planalto"
            className="w-56 h-56 object-contain drop-shadow-2xl"
          />
        </div>

        <Card className="shadow-2xl border-0 bg-white/95 backdrop-blur">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl text-center text-[hsl(145,60%,28%)]">
              Bem-vindo de volta
            </CardTitle>
            <CardDescription className="text-center">
              Entre com suas credenciais para acessar o sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-[hsl(145,60%,28%)] hover:bg-[hsl(145,60%,22%)] text-white font-semibold h-11"
                disabled={loading}
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-border text-center">
              <p className="text-xs text-muted-foreground">
                Sistema de gestão exclusivo para funcionários autorizados
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
