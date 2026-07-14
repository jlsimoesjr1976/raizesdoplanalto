import { supabase } from '@/integrations/supabase/client'
import type { Role } from '@/types/database'

interface Result { ok?: boolean; id?: string; error?: string }

async function call(body: Record<string, unknown>): Promise<Result> {
  const { data, error } = await supabase.functions.invoke('manage-users', { body })
  if (error) return { error: error.message }
  return data as Result
}

export function createUser(input: {
  name: string; email: string; password: string; role: Role; phone?: string; active?: boolean
}) {
  return call({ action: 'create', ...input })
}

export function updateUser(id: string, input: {
  name?: string; phone?: string; email?: string; password?: string; role?: Role; active?: boolean
}) {
  return call({ action: 'update', id, ...input })
}

export function deleteUser(id: string) {
  return call({ action: 'delete', id })
}
