// LifeChange: вход через Telegram. Supabase -> Edge Functions -> telegram-auth
// Секрет TELEGRAM_BOT_TOKEN задаётся в Edge Functions -> Secrets (в код его не вставляйте!).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const enc = new TextEncoder()
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
async function hmac(key: ArrayBuffer | Uint8Array, msg: string) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return await crypto.subtle.sign('HMAC', k, enc.encode(msg))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const BOT = Deno.env.get('TELEGRAM_BOT_TOKEN')
    if (!BOT) throw new Error('no_bot_token')
    const u = await req.json()
    const { hash, ...rest } = u
    if (!hash || !rest.id || !rest.auth_date) throw new Error('bad_data')

    // 1) проверка подписи Telegram
    const check = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join('\n')
    const secret = await crypto.subtle.digest('SHA-256', enc.encode(BOT))
    if (hex(await hmac(secret, check)) !== hash) throw new Error('bad_hash')
    if (Date.now() / 1000 - Number(rest.auth_date) > 86400) throw new Error('expired')

    // 2) вход или создание пользователя
    const id = String(rest.id)
    const email = `tg${id}@users.lifechange.uz`
    const password = hex(await hmac(enc.encode(BOT), 'lc-pass:' + id)) // знает только сервер
    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anon = createClient(url, anonKey, { auth: { persistSession: false } })

    let { data, error } = await anon.auth.signInWithPassword({ email, password })
    if (error) {
      const name = [rest.first_name, rest.last_name].filter(Boolean).join(' ').slice(0, 40)
      const c = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { name, tg_id: id, tg_username: rest.username ?? null },
      })
      if (c.error && !/already|registered/i.test(c.error.message)) throw c.error
      ;({ data, error } = await anon.auth.signInWithPassword({ email, password }))
      if (error) throw error
    }
    // 3) обновляем ник в Telegram (он мог измениться)
    await admin.from('profiles').update({ tg_username: rest.username ?? null }).eq('id', data.user!.id)

    return new Response(
      JSON.stringify({ access_token: data.session!.access_token, refresh_token: data.session!.refresh_token }),
      { headers: cors },
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 400, headers: cors })
  }
})
