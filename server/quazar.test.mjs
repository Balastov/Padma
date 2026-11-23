import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword } from './store.mjs'

const ORIGIN = 'http://localhost:5173'
const SECRET = 'test-secret'

/** Quazar stand-in: issues codes for a given profile, checks secret and PKCE. */
function fakeQuazar() {
  const codes = new Map()
  const tokens = new Map()
  const state = { failToken: false }
  const server = createServer(async (req, res) => {
    const reply = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(data))
    }
    if (req.url === '/api/oauth/token' && req.method === 'POST') {
      let raw = ''
      for await (const chunk of req) raw += chunk
      const form = new URLSearchParams(raw)
      if (state.failToken) return reply(500, { error: 'server_error' })
      if (
        form.get('client_id') !== 'padma' ||
        form.get('client_secret') !== SECRET
      )
        return reply(401, { error: 'invalid_client' })
      const entry = codes.get(form.get('code'))
      codes.delete(form.get('code'))
      const challenge = createHash('sha256')
        .update(form.get('code_verifier') || '')
        .digest('base64url')
      if (
        !entry ||
        entry.redirectUri !== form.get('redirect_uri') ||
        entry.challenge !== challenge
      )
        return reply(400, { error: 'invalid_grant' })
      const token = randomBytes(16).toString('hex')
      tokens.set(token, entry.profile)
      return reply(200, {
        access_token: token,
        token_type: 'Bearer',
        expires_in: 300,
      })
    }
    if (req.url === '/api/oauth/userinfo' && req.method === 'GET') {
      const profile = tokens.get(
        (req.headers.authorization || '').replace(/^Bearer /, ''),
      )
      return profile
        ? reply(200, profile)
        : reply(401, { error: 'invalid_token' })
    }
    reply(404, {})
  })
  /** What the authorize page does after «Продолжить»: a code for this profile. */
  function authorize(location, profile) {
    const url = new URL(location)
    assert.equal(url.pathname, '/oauth/authorize')
    assert.equal(url.searchParams.get('client_id'), 'padma')
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
    const code = randomBytes(16).toString('hex')
    codes.set(code, {
      profile,
      challenge: url.searchParams.get('code_challenge'),
      redirectUri: url.searchParams.get('redirect_uri'),
    })
    return { code, state: url.searchParams.get('state') }
  }
  return { server, authorize, state }
}

const profile = (sub, phone, extra = {}) => ({
  sub,
  phone_number: phone,
  phone_number_verified: true,
  given_name: 'Анна',
  family_name: 'Иванова',
  preferred_username: 'anna',
  ...extra,
})

test('sign-in and linking through Quazar', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-quazar-'))
  const quazar = fakeQuazar()
  await new Promise((resolve) => quazar.server.listen(0, '127.0.0.1', resolve))
  const quazarUrl = `http://127.0.0.1:${quazar.server.address().port}`
  const { server, db } = createApp({
    dbPath: join(dir, 'test.sqlite'),
    quazar: {
      clientId: 'padma',
      clientSecret: SECRET,
      webUrl: quazarUrl,
      apiUrl: quazarUrl + '/api',
      padmaUrl: ORIGIN,
      origins: [ORIGIN, 'https://padma.example'],
    },
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const off = createApp({ dbPath: join(dir, 'off.sqlite'), quazar: null })
  await new Promise((resolve) => off.server.listen(0, '127.0.0.1', resolve))
  const password = randomBytes(12).toString('hex')
  const hash = await hashPassword(password)
  for (const [id, roles, phone] of [
    ['owner', ['owner'], '+79990000001'],
    ['teacher', ['teacher'], '+79990000002'],
    ['student', ['student'], '+79990000003'],
    ['archived', ['student'], '+79990000004'],
  ])
    db.prepare(
      'INSERT INTO users (id,name,email,phone,password,roles,archived) VALUES (?,?,?,?,?,?,?)',
    ).run(
      id,
      id,
      `${id}@example.test`,
      phone,
      hash,
      JSON.stringify(roles),
      id === 'archived' ? 1 : 0,
    )

  async function request(path, method = 'GET', body, cookie = '') {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        Origin: ORIGIN,
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const type = res.headers.get('content-type') || ''
    return {
      status: res.status,
      body: type.includes('json') ? await res.json() : null,
      location: res.headers.get('location'),
      cookies: res.headers.getSetCookie(),
    }
  }
  const pick = (cookies, name) =>
    cookies.find((c) => c.startsWith(name + '='))?.split(';')[0] || ''
  async function login(id) {
    const res = await request('/login', 'POST', {
      email: `${id}@example.test`,
      password,
    })
    assert.equal(res.status, 200)
    return pick(res.cookies, 'padma_session')
  }
  /** Start → Quazar → callback; returns the callback answer. */
  async function viaQuazar(start, who, { cookie } = {}) {
    const { code, state } = quazar.authorize(start.url, who)
    return request(
      `/auth/quazar/callback?code=${code}&state=${state}`,
      'GET',
      undefined,
      cookie ?? start.flow,
    )
  }
  async function signIn(who) {
    const res = await request('/auth/quazar/start')
    assert.equal(res.status, 303)
    const flow = pick(res.cookies, 'padma_oauth')
    assert.match(res.cookies.join(), /SameSite=Lax/)
    return viaQuazar({ url: res.location, flow }, who)
  }
  async function link(session, who, returnTo = '/settings') {
    const res = await request(
      '/auth/quazar/link',
      'POST',
      { password, returnTo },
      session,
    )
    assert.equal(res.status, 200)
    return viaQuazar(
      { url: res.body.url, flow: pick(res.cookies, 'padma_oauth') },
      who,
    )
  }
  const me = async (cookie) =>
    (await request('/me', 'GET', undefined, cookie)).body
  const count = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n

  try {
    assert.deepEqual((await request('/auth/providers')).body, { quazar: true })
    const offBase = `http://127.0.0.1:${off.server.address().port}/api`
    assert.deepEqual(await (await fetch(offBase + '/auth/providers')).json(), {
      quazar: false,
    })
    assert.equal(
      (await fetch(offBase + '/auth/quazar/start', { redirect: 'manual' }))
        .status,
      404,
    )

    // A new Quazar user becomes a student without a teacher and without a password.
    const users = count()
    const created = await signIn(profile('q-new', '8 (999) 111-22-33'))
    assert.equal(created.status, 303)
    assert.equal(created.location, '/')
    const session = pick(created.cookies, 'padma_session')
    assert(session)
    const fresh = await me(session)
    assert.deepEqual(fresh.roles, ['student'])
    assert.equal(fresh.teacherId, null)
    assert.equal(fresh.phone, '+79991112233')
    assert.equal(fresh.name, 'Анна')
    assert.equal(fresh.surname, 'Иванова')
    assert.equal(fresh.quazarLinked, true)
    assert(fresh.photo)
    assert(!('quazarId' in fresh))
    assert.equal(count(), users + 1)
    assert.equal(
      (await request('/login', 'POST', { phone: '+79991112233', password: '' }))
        .status,
      401,
    )
    assert.equal(
      (
        await request(
          '/profile',
          'PATCH',
          { ...fresh, password: 'new-password-1', currentPassword: 'x' },
          session,
        )
      ).status,
      400,
    )
    // The callback returns to the allowed site the person started on.
    const startOn = (origin) =>
      fetch(base + '/auth/quazar/start', {
        redirect: 'manual',
        headers: { Origin: origin },
      })
    const callbackOf = (res) =>
      new URL(res.headers.get('location')).searchParams.get('redirect_uri')
    const other = await startOn('https://padma.example')
    assert.equal(
      callbackOf(other),
      'https://padma.example/api/auth/quazar/callback',
    )
    const viaOther = await viaQuazar(
      {
        url: other.headers.get('location'),
        flow: pick(other.headers.getSetCookie(), 'padma_oauth'),
      },
      profile('q-new', '+79991112233'),
    )
    assert.equal(viaOther.location, '/')
    assert.equal(
      callbackOf(await startOn('https://evil.test')),
      ORIGIN + '/api/auth/quazar/callback',
    )
    // Same Quazar account again: same user, no duplicate.
    const again = await signIn(profile('q-new', '+79991112233'))
    assert.equal((await me(pick(again.cookies, 'padma_session'))).id, fresh.id)
    assert.equal(count(), users + 1)
    // The phone of a linked account is managed by Quazar only.
    assert.equal(
      (
        await request(
          '/profile',
          'PATCH',
          { ...fresh, phone: '+79995554433' },
          session,
        )
      ).status,
      400,
    )
    assert.equal(
      (await request('/profile', 'PATCH', { ...fresh, name: 'Аня' }, session))
        .status,
      200,
    )
    const owner = await login('owner')
    assert.equal(
      (
        await request(
          `/users/${fresh.id}`,
          'PATCH',
          { ...fresh, phone: '+79995554433' },
          owner,
        )
      ).status,
      400,
    )
    // Quazar is the source of the number: a changed number is taken over on sign-in.
    await signIn(profile('q-new', '+79991112244'))
    assert.equal((await me(session)).phone, '+79991112244')

    // Without a link a Padma number is never taken over.
    const taken = await signIn(profile('q-student', '+79990000003'))
    assert.equal(taken.location, '/?quazar=phone_taken')
    assert.equal(pick(taken.cookies, 'padma_session'), '')
    assert.equal(
      (await signIn(profile('q-arch', '+79990000004'))).location,
      '/?quazar=archived',
    )
    assert.equal(
      (
        await signIn(
          profile('q-unv', '+79997770000', { phone_number_verified: false }),
        )
      ).location,
      '/?quazar=unverified',
    )
    assert.equal(count(), users + 1)

    // The flow belongs to the browser that started it and works once.
    const start = await request('/auth/quazar/start')
    const flowCookie = pick(start.cookies, 'padma_oauth')
    const stranger = await viaQuazar(
      { url: start.location, flow: flowCookie },
      profile('q-x', '+79997770001'),
      {
        cookie: 'padma_oauth=other',
      },
    )
    assert.equal(stranger.location, '/?quazar=expired')
    const reused = await viaQuazar(
      { url: start.location, flow: flowCookie },
      profile('q-x', '+79997770001'),
    )
    assert.equal(reused.location, '/?quazar=expired')
    const cancelled = await request('/auth/quazar/start')
    const denied = await request(
      `/auth/quazar/callback?error=access_denied&state=${new URL(cancelled.location).searchParams.get('state')}`,
      'GET',
      undefined,
      pick(cancelled.cookies, 'padma_oauth'),
    )
    assert.equal(denied.location, '/?quazar=denied')
    quazar.state.failToken = true
    assert.equal(
      (await signIn(profile('q-x', '+79997770001'))).location,
      '/?quazar=failed',
    )
    quazar.state.failToken = false

    // Linking needs the password again and the same number on both sides.
    const student = await login('student')
    assert.equal(
      (
        await request(
          '/auth/quazar/link',
          'POST',
          { password: 'wrong' },
          student,
        )
      ).status,
      400,
    )
    assert.equal(
      (await request('/auth/quazar/link', 'POST', { password })).status,
      401,
    )
    assert.equal(
      (await link(student, profile('q-student', '+79990000009'))).location,
      '/settings?quazar=mismatch',
    )
    assert.equal(
      (await link(student, profile('q-new', '+79990000003'))).location,
      '/settings?quazar=linked_other',
    )
    const linked = await link(
      student,
      profile('q-student', '+79990000003'),
      'https://evil.test',
    )
    assert.equal(linked.location, '/?quazar=linked')
    assert.equal(pick(linked.cookies, 'padma_session'), '')
    assert.equal((await me(student)).quazarLinked, true)
    assert.equal(
      (await request('/auth/quazar/link', 'POST', { password }, student))
        .status,
      400,
    )
    // Now Quazar signs in to the existing account; the password still works.
    const back = await signIn(profile('q-student', '+79990000003'))
    assert.equal((await me(pick(back.cookies, 'padma_session'))).id, 'student')
    assert(await login('student'))
    // Staff can link their account too.
    const teacher = await login('teacher')
    assert.equal(
      (
        await link(
          teacher,
          profile('q-teacher', '+79990000002'),
          '/teacher/settings',
        )
      ).location,
      '/teacher/settings?quazar=linked',
    )
    // An archived account is not reachable through Quazar either.
    db.prepare("UPDATE users SET archived=1 WHERE id='student'").run()
    assert.equal(
      (await signIn(profile('q-student', '+79990000003'))).location,
      '/?quazar=archived',
    )
  } finally {
    server.close()
    off.server.close()
    quazar.server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
