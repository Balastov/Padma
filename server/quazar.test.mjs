import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword, openStore } from './store.mjs'
import { initQuazar } from './quazar.mjs'

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
  async function signIn(who, path = '/auth/quazar/start') {
    const res = await request(path)
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
    const providers = (await request('/auth/providers')).body
    assert.equal(providers.quazar, true)
    // Password sign-in ends a month after this version first starts.
    const month = Date.parse(providers.passwordDeadline) - Date.now()
    assert(month > 27 * 864e5 && month < 32 * 864e5)
    const offBase = `http://127.0.0.1:${off.server.address().port}/api`
    assert.equal(
      (await (await fetch(offBase + '/auth/providers')).json()).quazar,
      false,
    )
    assert.equal(
      (await fetch(offBase + '/auth/quazar/start', { redirect: 'manual' }))
        .status,
      404,
    )

    // A new Quazar user becomes a student without a teacher and without a password.
    const users = count()
    // Quazar sends E.164; anything else is not taken as a checked number.
    assert.equal(
      (await signIn(profile('q-raw', '8 (999) 111-22-33'))).location,
      '/?quazar=unverified',
    )
    const created = await signIn(profile('q-new', '+79991112233'))
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
    // «Зарегистрироваться» opens the simplified sign-up in Quazar.
    const plain = await request('/auth/quazar/start')
    assert.equal(new URL(plain.location).searchParams.get('prompt'), null)
    const signUp = await request('/auth/quazar/start?register=1')
    assert.equal(new URL(signUp.location).searchParams.get('prompt'), 'create')
    // A number of another country comes from Quazar as it is.
    const abroad = await signIn(
      profile('q-abroad', '+491701234567', {
        given_name: 'Ханс',
        family_name: 'Мюллер',
      }),
      '/auth/quazar/start?register=1',
    )
    assert.equal(abroad.location, '/')
    const hans = await me(pick(abroad.cookies, 'padma_session'))
    assert.equal(hans.phone, '+491701234567')
    assert.equal(hans.name, 'Ханс')
    assert.equal(hans.surname, 'Мюллер')
    db.prepare('DELETE FROM sessions WHERE userId=?').run(hans.id)
    db.prepare('DELETE FROM users WHERE id=?').run(hans.id)
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
    const elsewhere = await login('student')
    const linked = await link(
      student,
      profile('q-student', '+79990000003'),
      'https://evil.test',
    )
    assert.equal(linked.location, '/?quazar=linked')
    // Password sessions end; the browser that linked gets a fresh one.
    const linkedSession = pick(linked.cookies, 'padma_session')
    assert(linkedSession)
    for (const old of [student, elsewhere])
      assert.equal((await request('/me', 'GET', undefined, old)).status, 401)
    const linkedUser = await me(linkedSession)
    assert.equal(linkedUser.quazarLinked, true)
    assert.equal(
      (await request('/auth/quazar/link', 'POST', { password }, linkedSession))
        .status,
      400,
    )
    // Password sign-in is closed; only the right password learns why.
    const byPassword = await request('/login', 'POST', {
      email: 'student@example.test',
      password,
    })
    assert.equal(byPassword.status, 403)
    assert.match(byPassword.body.error, /Квазар/)
    assert.equal(pick(byPassword.cookies, 'padma_session'), '')
    assert.equal(
      (
        await request('/login', 'POST', {
          email: 'student@example.test',
          password: 'wrong-password',
        })
      ).status,
      401,
    )
    // Nor can the password be changed, by the user or by an admin.
    assert.equal(
      (
        await request(
          '/profile',
          'PATCH',
          {
            ...linkedUser,
            password: 'new-password-1',
            currentPassword: password,
          },
          linkedSession,
        )
      ).status,
      400,
    )
    assert.equal(
      (
        await request(
          '/users/student',
          'PATCH',
          { ...linkedUser, password: 'new-password-1' },
          owner,
        )
      ).status,
      400,
    )
    // Quazar signs in to the existing account.
    const back = await signIn(profile('q-student', '+79990000003'))
    assert.equal((await me(pick(back.cookies, 'padma_session'))).id, 'student')
    // Staff can link their account too.
    const teacher = await login('teacher')
    const teacherLinked = await link(
      teacher,
      profile('q-teacher', '+79990000002'),
      '/teacher/settings',
    )
    assert.equal(teacherLinked.location, '/teacher/settings?quazar=linked')
    const teacherSession = pick(teacherLinked.cookies, 'padma_session')

    // Owner or admin unlinks: the link and the password go; a teacher cannot.
    const unlink = (cookie, id = 'student') =>
      request(`/users/${id}/quazar`, 'DELETE', {}, cookie)
    assert.equal((await unlink(teacherSession)).status, 403)
    assert.equal((await unlink(owner, 'owner')).status, 400)
    const unlinked = await unlink(owner)
    assert.equal(unlinked.status, 200)
    assert.equal(unlinked.body.quazarLinked, false)
    assert.equal(unlinked.body.hasPassword, false)
    assert.equal(
      (
        await request(
          '/me',
          'GET',
          undefined,
          pick(back.cookies, 'padma_session'),
        )
      ).status,
      401,
    )
    assert.equal(
      (
        await request('/login', 'POST', {
          email: 'student@example.test',
          password,
        })
      ).status,
      401,
    )
    assert.equal((await unlink(owner)).status, 400)
    // Nobody uses an account without a password and a link: the confirmed
    // number takes it at the next sign-in, and the card shows when.
    const claimed = await signIn(profile('q-student-2', '+79990000003'))
    assert.equal(claimed.location, '/')
    const claimedUser = await me(pick(claimed.cookies, 'padma_session'))
    assert.equal(claimedUser.id, 'student')
    assert.equal(claimedUser.quazarLinked, true)
    assert(Date.now() - claimedUser.quazarClaimedAt < 60000)
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

test('linked accounts sign in again once password sign-in closes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-quazar-'))
  const dbPath = join(dir, 'test.sqlite')
  // A database from before: linked and unlinked users with open sessions.
  const before = openStore(dbPath)
  initQuazar(before)
  for (const [id, quazarId] of [
    ['linked', 'q-1'],
    ['plain', null],
  ]) {
    before
      .prepare(
        'INSERT INTO users (id,name,email,password,roles,quazarId) VALUES (?,?,?,?,?,?)',
      )
      .run(id, id, `${id}@example.test`, 'x', '["student"]', quazarId)
    before
      .prepare('INSERT INTO sessions VALUES (?,?,?)')
      .run('token-' + id, id, Date.now() + 1e6)
  }
  before.exec(`DELETE FROM app_meta WHERE key='quazarPasswordClosed'`)
  before.close()
  const sessions = (db) =>
    db
      .prepare('SELECT userId FROM sessions ORDER BY userId')
      .all()
      .map((row) => row.userId)
  const app = createApp({ dbPath, quazar: null })
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  try {
    assert.deepEqual(sessions(app.db), ['plain'])
    // Only once: later sessions of linked accounts stay.
    app.db
      .prepare('INSERT INTO sessions VALUES (?,?,?)')
      .run('token-new', 'linked', Date.now() + 1e6)
    initQuazar(app.db)
    assert.deepEqual(sessions(app.db), ['linked', 'plain'])
  } finally {
    app.server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
