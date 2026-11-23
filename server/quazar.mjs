// Sign-in through Quazar (quazar-msg.ru): OAuth 2.0 code + PKCE, see QUAZAR_SSO.md.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { normalizePhone, isCompleteRuPhone } from './store.mjs'
import { studentPhoto } from './avatars.mjs'
import { DEFAULT_TIME_ZONE } from './timezone.mjs'

const FLOW_TTL = 600000
const CALLBACK = '/api/auth/quazar/callback'
const hash = (value) => createHash('sha256').update(value).digest('hex')
const random = () => randomBytes(32).toString('base64url')

/** Settings from the environment; null keeps sign-in through Quazar off. */
export function quazarConfig(env, origins) {
  if (!env.QUAZAR_CLIENT_ID || !env.QUAZAR_CLIENT_SECRET) return null
  return {
    clientId: env.QUAZAR_CLIENT_ID,
    clientSecret: env.QUAZAR_CLIENT_SECRET,
    webUrl: (env.QUAZAR_WEB_URL || 'https://quazar-msg.ru').replace(/\/$/, ''),
    apiUrl: (env.QUAZAR_API_URL || 'https://quazar-msg.ru/api').replace(
      /\/$/,
      '',
    ),
    padmaUrl: (env.PADMA_URL || origins[0]).replace(/\/$/, ''),
    origins,
  }
}

export function initQuazar(db) {
  if (
    !db
      .prepare('PRAGMA table_info(users)')
      .all()
      .some((column) => column.name === 'quazarId')
  )
    db.exec('ALTER TABLE users ADD COLUMN quazarId TEXT')
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS users_quazar_unique
    ON users(quazarId) WHERE quazarId IS NOT NULL`)
  // Flows live ten minutes: an older layout is simply dropped.
  const flowColumns = db.prepare('PRAGMA table_info(quazar_flows)').all()
  if (
    flowColumns.length &&
    !flowColumns.some((column) => column.name === 'redirectUri')
  )
    db.exec('DROP TABLE quazar_flows')
  db.exec(`CREATE TABLE IF NOT EXISTS quazar_flows (
    state TEXT PRIMARY KEY, binding TEXT NOT NULL, verifier TEXT NOT NULL,
    mode TEXT NOT NULL, userId TEXT, returnTo TEXT NOT NULL, expires INTEGER NOT NULL,
    redirectUri TEXT NOT NULL
  )`)
}

/** Only an in-app path: never another site. */
const safePath = (value) =>
  typeof value === 'string' && /^\/(?!\/)[\w/-]{0,200}$/.test(value)
    ? value
    : '/'

const withCode = (path, code) => `${path}?quazar=${code}`

async function quazarProfile(config, code, verifier, redirectUri) {
  const signal = AbortSignal.timeout(10000)
  const tokenRes = await fetch(config.apiUrl + '/oauth/token', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  })
  if (!tokenRes.ok) return null
  const { access_token: accessToken } = await tokenRes.json()
  if (typeof accessToken !== 'string' || !accessToken) return null
  const infoRes = await fetch(config.apiUrl + '/oauth/userinfo', {
    signal,
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!infoRes.ok) return null
  const info = await infoRes.json()
  if (
    !info ||
    typeof info.sub !== 'string' ||
    !info.sub ||
    info.sub.length > 64
  )
    return null
  return info
}

const nameOf = (value) =>
  typeof value === 'string' ? value.trim().slice(0, 80) : ''

/**
 * Handles /api/auth/providers and /api/auth/quazar/*; true when the request was answered.
 * The callback comes from another site, so the Strict session cookie is absent there:
 * linking takes the user from the flow created after the password check.
 */
export async function quazarRoute({
  path,
  req,
  res,
  db,
  user,
  body,
  send,
  config,
  secure,
  startSession,
  checkPassword,
}) {
  if (path === '/api/auth/providers' && req.method === 'GET') {
    send(200, { quazar: Boolean(config) })
    return true
  }
  if (!path.startsWith('/api/auth/quazar/')) return false
  const fail = (status, message) => {
    throw Object.assign(new Error(message), { status })
  }
  if (!config) fail(404, 'Вход через Квазар не настроен')
  const flowCookie = (value) =>
    `padma_oauth=${value}; HttpOnly; SameSite=Lax; Path=/api/auth/quazar; Max-Age=${value ? FLOW_TTL / 1000 : 0}${secure ? '; Secure' : ''}`
  const redirect = (location, cookies = []) => {
    res.writeHead(303, {
      Location: location,
      'Set-Cookie': cookies,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    })
    res.end()
    return true
  }
  // Back to the address the person started on (padma.ru or www.padma.ru):
  // the flow cookie and the session live there. Only an allowed origin.
  const host = req.headers.host || ''
  const site =
    [req.headers.origin, `https://${host}`, `http://${host}`].find(
      (origin) => origin && (config.origins || []).includes(origin),
    ) || config.padmaUrl
  function begin(mode, userId, returnTo) {
    const redirectUri = site + CALLBACK
    const state = random(),
      verifier = random(),
      binding = random()
    const now = Date.now()
    db.prepare('DELETE FROM quazar_flows WHERE expires<?').run(now)
    db.prepare('INSERT INTO quazar_flows VALUES (?,?,?,?,?,?,?,?)').run(
      hash(state),
      hash(binding),
      verifier,
      mode,
      userId,
      returnTo,
      now + FLOW_TTL,
      redirectUri,
    )
    const url =
      config.webUrl +
      '/oauth/authorize?' +
      new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: redirectUri,
        state,
        code_challenge: createHash('sha256')
          .update(verifier)
          .digest('base64url'),
        code_challenge_method: 'S256',
      })
    return { url, cookie: flowCookie(binding) }
  }
  if (path === '/api/auth/quazar/start' && req.method === 'GET') {
    const { url, cookie } = begin('login', null, '/')
    return redirect(url, [cookie])
  }
  if (path === '/api/auth/quazar/link' && req.method === 'POST') {
    if (!user) fail(401, 'Войдите в свой аккаунт')
    const data = await body(req)
    if (user.quazarLinked) fail(400, 'Квазар уже привязан')
    if (!(await checkPassword(user.id, data.password, req)))
      fail(400, 'Неверный пароль')
    const { url, cookie } = begin('link', user.id, safePath(data.returnTo))
    send(200, { url }, { 'Set-Cookie': cookie })
    return true
  }
  if (path === '/api/auth/quazar/callback' && req.method === 'GET') {
    const params = new URL(req.url, 'http://localhost').searchParams
    const state = params.get('state') || ''
    const binding =
      /(?:^|;\s*)padma_oauth=([^;]*)/.exec(req.headers.cookie || '')?.[1] || ''
    const flow = db
      .prepare('SELECT * FROM quazar_flows WHERE state=?')
      .get(hash(state))
    if (flow)
      db.prepare('DELETE FROM quazar_flows WHERE state=?').run(flow.state)
    const cleared = flowCookie('')
    if (!flow || flow.expires < Date.now() || flow.binding !== hash(binding))
      return redirect(withCode('/', 'expired'), [cleared])
    const back = (code, cookies = [cleared]) =>
      redirect(withCode(flow.returnTo, code), cookies)
    if (params.get('error'))
      return back(params.get('error') === 'access_denied' ? 'denied' : 'failed')
    let info = null
    try {
      info = await quazarProfile(
        config,
        params.get('code') || '',
        flow.verifier,
        flow.redirectUri,
      )
    } catch (error) {
      console.error('Квазар не ответил при входе', error)
    }
    if (!info) return back('failed')
    const phone = normalizePhone(
      typeof info.phone_number === 'string' ? info.phone_number : '',
    )
    if (info.phone_number_verified !== true || !isCompleteRuPhone(phone))
      return back('unverified')
    const byPhone = (id) =>
      db
        .prepare('SELECT id, archived FROM users WHERE phone=? AND id!=?')
        .get(phone, id)
    const linked = db
      .prepare('SELECT * FROM users WHERE quazarId=?')
      .get(info.sub)

    if (flow.mode === 'link') {
      const target = db
        .prepare('SELECT * FROM users WHERE id=? AND archived=0')
        .get(flow.userId)
      if (!target) return back('expired')
      if (target.quazarId)
        return back(target.quazarId === info.sub ? 'linked' : 'already')
      if (linked) return back('linked_other')
      if (target.phone !== phone) return back('mismatch')
      db.prepare(
        'UPDATE users SET quazarId=? WHERE id=? AND quazarId IS NULL',
      ).run(info.sub, target.id)
      return back('linked')
    }

    let userId = linked?.id
    if (linked) {
      if (linked.archived) return back('archived')
      // Quazar is the source of the phone: keep both services on one number.
      if (linked.phone !== phone) {
        if (byPhone(linked.id)) return back('phone_taken')
        db.prepare('UPDATE users SET phone=? WHERE id=?').run(phone, linked.id)
      }
    } else {
      const holder = byPhone('')
      if (holder) return back(holder.archived ? 'archived' : 'phone_taken')
      userId = randomUUID()
      try {
        db.prepare(
          `INSERT INTO users (id,name,surname,email,phone,password,roles,teacherId,photo,notificationsEnabled,timeZone,quazarId)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).run(
          userId,
          nameOf(info.given_name) ||
            nameOf(info.preferred_username) ||
            'Ученик',
          nameOf(info.family_name),
          '',
          phone,
          '',
          JSON.stringify(['student']),
          null,
          studentPhoto(['student'], ''),
          0,
          DEFAULT_TIME_ZONE,
          info.sub,
        )
      } catch (error) {
        if (!String(error).includes('UNIQUE')) throw error
        return back('failed')
      }
    }
    return redirect('/', [cleared, startSession(userId)])
  }
  fail(404, 'Не найдено')
}
