import { supabase } from '@/integrations/supabase/client'

export interface CustomerAccount {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  address_reference: string | null
}

export interface CartLine {
  product_id?: string
  combo_id?: string
  quantity: number
  notes?: string
}

interface AuthResult { token?: string; customer?: CustomerAccount; error?: string }

// Extrai a mensagem de erro do corpo, mesmo em respostas 4xx (FunctionsHttpError.context é a Response)
async function errorMessage(error: unknown, data: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try { const b = await ctx.json(); if (b?.error) return b.error } catch { /* ignore */ }
  }
  return (data as { error?: string })?.error ?? (error as { message?: string })?.message ?? 'Erro inesperado.'
}

async function callAuth(body: Record<string, unknown>): Promise<AuthResult> {
  const { data, error } = await supabase.functions.invoke('customer-auth', { body })
  if (error) return { error: await errorMessage(error, data) }
  return data as AuthResult
}

export function customerSignup(input: { name: string; email: string; phone?: string; address: string; address_reference?: string; password: string }) {
  return callAuth({ action: 'signup', ...input })
}
export function customerLogin(input: { email: string; password: string }) {
  return callAuth({ action: 'login', ...input })
}
export async function customerMe(token: string): Promise<CustomerAccount | null> {
  const { data } = await supabase.functions.invoke('customer-auth', { body: { action: 'me', token } })
  return (data as { customer?: CustomerAccount })?.customer ?? null
}
export async function customerLogout(token: string) {
  await supabase.functions.invoke('customer-auth', { body: { action: 'logout', token } })
}

export async function placeOrder(token: string, items: CartLine[], notes?: string): Promise<{ order_id?: string; total?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke('place-order', { body: { token, items, notes } })
  if (error) return { error: await errorMessage(error, data) }
  return data as { order_id?: string; total?: number }
}
