// Gerenciamento de usuários do sistema (somente admin).
// create: cria usuário no Auth + perfil. update: atualiza perfil/senha.
// delete: remove usuário do Auth (perfil sai por cascade).

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const VALID_ROLES = ['admin', 'atendente', 'cozinha', 'bar', 'caixa']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await caller.auth.getUser()
    if (!user) return json({ error: 'Não autenticado' })

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Confirma que o solicitante é admin
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') return json({ error: 'Apenas administradores podem gerenciar usuários.' })

    const { action, id, name, phone, email, password, role, active } = await req.json()

    if (action === 'create') {
      if (!email || !password || !name || !role) return json({ error: 'Preencha nome, e-mail, senha e nível.' })
      if (!VALID_ROLES.includes(role)) return json({ error: 'Nível inválido.' })
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      })
      if (cErr || !created.user) return json({ error: cErr?.message ?? 'Erro ao criar usuário no Auth.' })
      const { error: pErr } = await admin.from('profiles').insert({
        id: created.user.id, name, role, phone: phone ?? null, email, active: active ?? true,
      })
      if (pErr) {
        await admin.auth.admin.deleteUser(created.user.id) // rollback
        return json({ error: 'Erro ao criar o perfil: ' + pErr.message })
      }
      return json({ ok: true, id: created.user.id })
    }

    if (action === 'update') {
      if (!id) return json({ error: 'Usuário não informado.' })
      const prof: Record<string, unknown> = {}
      if (name !== undefined) prof.name = name
      if (phone !== undefined) prof.phone = phone
      if (role !== undefined) { if (!VALID_ROLES.includes(role)) return json({ error: 'Nível inválido.' }); prof.role = role }
      if (active !== undefined) prof.active = active
      if (Object.keys(prof).length) await admin.from('profiles').update(prof).eq('id', id)
      const authUpd: Record<string, unknown> = {}
      if (email) authUpd.email = email
      if (password) authUpd.password = password
      if (Object.keys(authUpd).length) {
        const { error } = await admin.auth.admin.updateUserById(id, authUpd)
        if (error) return json({ error: error.message })
        if (email) await admin.from('profiles').update({ email }).eq('id', id)
      }
      return json({ ok: true })
    }

    if (action === 'delete') {
      if (!id) return json({ error: 'Usuário não informado.' })
      if (id === user.id) return json({ error: 'Você não pode excluir o próprio usuário.' })
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) return json({ error: error.message })
      await admin.from('profiles').delete().eq('id', id)
      return json({ ok: true })
    }

    return json({ error: 'Ação inválida.' })
  } catch (err) {
    return json({ error: String(err) })
  }
})
