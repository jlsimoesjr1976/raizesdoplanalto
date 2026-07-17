import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { customerLogin, customerSignup, customerMe, customerLogout, customerUpdateAddress, type CustomerAccount, type AddressInput } from '@/lib/customerApi'

const TOKEN_KEY = 'raizes_customer_token'

interface CustomerCtx {
  customer: CustomerAccount | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<string | null>
  signup: (input: { name: string; email: string; phone?: string; password: string } & AddressInput) => Promise<string | null>
  updateAddress: (input: AddressInput) => Promise<string | null>
  logout: () => void
}

const Ctx = createContext<CustomerCtx | undefined>(undefined)

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<CustomerAccount | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY)
    if (!t) { setLoading(false); return }
    customerMe(t).then((c) => {
      if (c) { setCustomer(c); setToken(t) }
      else { localStorage.removeItem(TOKEN_KEY); setToken(null) }
    }).finally(() => setLoading(false))
  }, [])

  const persist = (t: string, c: CustomerAccount) => {
    localStorage.setItem(TOKEN_KEY, t)
    setToken(t); setCustomer(c)
  }

  const login: CustomerCtx['login'] = async (email, password) => {
    const res = await customerLogin({ email, password })
    if (res.error || !res.token || !res.customer) return res.error ?? 'Falha no login.'
    persist(res.token, res.customer)
    return null
  }

  const signup: CustomerCtx['signup'] = async (input) => {
    const res = await customerSignup(input)
    if (res.error || !res.token || !res.customer) return res.error ?? 'Falha no cadastro.'
    persist(res.token, res.customer)
    return null
  }

  const updateAddress: CustomerCtx['updateAddress'] = async (input) => {
    if (!token) return 'Sessão expirada. Faça login novamente.'
    const res = await customerUpdateAddress(token, input)
    if (res.error || !res.customer) return res.error ?? 'Falha ao atualizar o endereço.'
    setCustomer(res.customer)
    return null
  }

  const logout = useCallback(() => {
    const t = localStorage.getItem(TOKEN_KEY)
    if (t) customerLogout(t)
    localStorage.removeItem(TOKEN_KEY)
    setToken(null); setCustomer(null)
  }, [])

  return (
    <Ctx.Provider value={{ customer, token, loading, login, signup, updateAddress, logout }}>
      {children}
    </Ctx.Provider>
  )
}

export function useCustomer() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useCustomer deve ser usado dentro de CustomerProvider')
  return c
}
