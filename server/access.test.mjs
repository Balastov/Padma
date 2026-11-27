import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createApp } from './index.mjs'
import { hashPassword } from './store.mjs'

const ORIGIN = 'http://localhost:5173'
const b64 = (bytes) => Buffer.from(bytes).toString('base64url')

/** Minimal CBOR: unsigned and negative integers, text, bytes, maps. */
function cbor(value) {
  const head = (major, n) => {
    if (n < 24) return Buffer.from([(major << 5) | n])
    if (n < 256) return Buffer.from([(major << 5) | 24, n])
    const out = Buffer.alloc(3)
    out[0] = (major << 5) | 25
    out.writeUInt16BE(n, 1)
    return out
  }
  if (typeof value === 'number')
    return value >= 0 ? head(0, value) : head(1, -1 - value)
  if (typeof value === 'string') {
    const text = Buffer.from(value)
    return Buffer.concat([head(3, text.length), text])
  }
  if (Buffer.isBuffer(value))
    return Buffer.concat([head(2, value.length), value])
  return Buffer.concat([
    head(5, value.size),
    ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)]),
  ])
}

/** A software passkey (P-256, attestation «none»), as a browser would answer. */
function authenticator(rpID, origin = ORIGIN) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  })
  const jwk = publicKey.export({ format: 'jwk' })
  const id = randomBytes(16)
  const rpHash = createHash('sha256').update(rpID).digest()
  let counter = 0
  const clientData = (type, challenge) =>
    Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }))
  return {
    id: b64(id),
    register(options) {
      const key = cbor(
        new Map([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, Buffer.from(jwk.x, 'base64url')],
          [-3, Buffer.from(jwk.y, 'base64url')],
        ]),
      )
      const length = Buffer.alloc(2)
      length.writeUInt16BE(id.length)
      const authData = Buffer.concat([
        rpHash,
        Buffer.from([0x45]), // user present, verified, credential data
        Buffer.alloc(4),
        Buffer.alloc(16),
        length,
        id,
        key,
      ])
      return {
        id: b64(id),
        rawId: b64(id),
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(clientData('webauthn.create', options.challenge)),
          attestationObject: b64(
            cbor(
              new Map([
                ['fmt', 'none'],
                ['attStmt', new Map()],
                ['authData', authData],
              ]),
            ),
          ),
          transports: ['internal'],
        },
      }
    },
    sign(options, flags = 0x05) {
      counter++
      const count = Buffer.alloc(4)
      count.writeUInt32BE(counter)
      const authData = Buffer.concat([rpHash, Buffer.from([flags]), count])
      const data = clientData('webauthn.get', options.challenge)
      const signature = sign(
        'sha256',
        Buffer.concat([authData, createHash('sha256').update(data).digest()]),
        privateKey,
      )
      return {
        id: b64(id),
        rawId: b64(id),
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(data),
          authenticatorData: b64(authData),
          signature: b64(signature),
        },
      }
    },
  }
}

test('password reset, login links and passkeys', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-access-'))
  const dbPath = join(dir, 'test.sqlite')
  const { server, db } = createApp({ dbPath, origins: [ORIGIN], quazar: null })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const password = randomBytes(12).toString('hex')
  const hash = await hashPassword(password)
  for (const [id, roles, phone, quazarId] of [
    ['owner', ['owner'], '+79990000001', null],
    ['admin', ['admin'], '+79990000002', null],
    ['teacher', ['teacher'], '+79990000003', null],
    ['student', ['student'], '+79990000004', null],
    ['linked', ['student'], '+79990000005', 'q-linked'],
  ])
    db.prepare(
      'INSERT INTO users (id,name,email,phone,password,roles,quazarId) VALUES (?,?,?,?,?,?,?)',
    ).run(
      id,
      id,
      `${id}@example.test`,
      phone,
      quazarId ? '' : hash,
      JSON.stringify(roles),
      quazarId,
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
      cookie: (res.headers.get('set-cookie') || '').split(';')[0],
    }
  }
  const login = async (id) => {
    const res = await request('/login', 'POST', {
      email: `${id}@example.test`,
      password,
    })
    assert.equal(res.status, 200, id)
    return res.cookie
  }
  const me = async (cookie) => await request('/me', 'GET', undefined, cookie)
  const owner = await login('owner')
  const admin = await login('admin')
  const teacher = await login('teacher')
  const student = await login('student')
  try {
    // «Сбросить пароль»: owner or admin, not for oneself, not for a linked account.
    const reset = (id, cookie) =>
      request(`/users/${id}/password`, 'DELETE', {}, cookie)
    assert.equal((await reset('student', teacher)).status, 403)
    assert.equal((await reset('owner', owner)).status, 400)
    assert.equal((await reset('linked', owner)).status, 400)
    db.prepare(`UPDATE users SET phone='' WHERE id='student'`).run()
    assert.equal((await reset('student', owner)).status, 400)
    db.prepare(`UPDATE users SET phone='12345' WHERE id='student'`).run()
    assert.equal((await reset('student', owner)).status, 400)
    db.prepare(`UPDATE users SET phone='+79990000004' WHERE id='student'`).run()
    const done = await reset('student', admin)
    assert.equal(done.status, 200)
    assert.equal(done.body.hasPassword, false)
    assert.equal((await me(student)).status, 401)
    assert.equal(
      (
        await request('/login', 'POST', {
          email: 'student@example.test',
          password,
        })
      ).status,
      401,
    )
    assert.equal((await reset('student', owner)).status, 400)

    // Login links from the site: only by and for owners and administrators.
    const issue = (id, cookie) =>
      request(`/users/${id}/login-link`, 'POST', {}, cookie)
    assert.equal((await issue('admin', teacher)).status, 403)
    assert.equal((await issue('teacher', owner)).status, 403)
    assert.equal((await issue('nobody', owner)).status, 404)
    const issued = await issue('admin', owner)
    assert.equal(issued.status, 200)
    assert(issued.body.url.startsWith(ORIGIN + '/api/auth/link?token='))
    assert(issued.body.expires - Date.now() <= 15 * 60000)
    const open = (url) => request(url.replace(ORIGIN + '/api', ''))
    const opened = await open(issued.body.url)
    assert.equal(opened.status, 303)
    assert.equal(opened.location, '/')
    assert.equal((await me(opened.cookie)).body.id, 'admin')
    // Once only; the record keeps who issued it and when it was used.
    const again = await open(issued.body.url)
    assert.equal(again.location, '/?login=expired')
    assert.equal(again.cookie, '')
    const token = new URL(issued.body.url).searchParams.get('token')
    const journal = db.prepare('SELECT * FROM login_links').get()
    assert.notEqual(journal.token, token)
    assert.equal(journal.createdBy, 'owner')
    assert(journal.used)
    // Expired, or the person is no longer an administrator.
    const late = await issue('admin', owner)
    db.prepare('UPDATE login_links SET expires=? WHERE used IS NULL').run(1)
    assert.equal((await open(late.body.url)).location, '/?login=expired')
    const demoted = await issue('admin', owner)
    db.prepare(`UPDATE users SET roles='["teacher"]' WHERE id='admin'`).run()
    assert.equal((await open(demoted.body.url)).location, '/?login=expired')
    db.prepare(`UPDATE users SET roles='["admin"]' WHERE id='admin'`).run()
    assert.equal(
      (await open('/auth/link?token=bad')).location,
      '/?login=expired',
    )

    // The server script: any account, found by phone or email.
    const script = fileURLToPath(new URL('./loginLink.mjs', import.meta.url))
    const run = (login, env = { PADMA_URL: 'https://padma.example' }) =>
      spawnSync(process.execPath, [script, login], {
        encoding: 'utf8',
        env: { ...process.env, PADMA_DB: dbPath, APP_ORIGIN: '', ...env },
      })
    assert.match(run('+79990000099').stderr, /не найден/)
    assert.equal(run('+79990000099').status, 1)
    assert.match(run('student@example.test', {}).stderr, /PADMA_URL/)
    const printed = run('8 999 000-00-04')
    assert.equal(printed.status, 0, printed.stderr)
    const url = printed.stdout.trim().split('\n').at(-1)
    assert(url.startsWith('https://padma.example/api/auth/link?token='))
    const rescued = await open(url.replace('https://padma.example', ORIGIN))
    assert.equal((await me(rescued.cookie)).body.id, 'student')

    // Passkeys: owners and administrators add them and sign in without a password.
    assert.deepEqual(
      (await request('/passkeys', 'GET', undefined, teacher)).body,
      [],
    )
    assert.equal(
      (await request('/passkeys/options', 'POST', {}, teacher)).status,
      403,
    )
    const device = authenticator('localhost')
    const options = (await request('/passkeys/options', 'POST', {}, owner)).body
    assert.equal(options.rp.id, 'localhost')
    assert.equal(options.authenticatorSelection.userVerification, 'required')
    const registration = device.register(options)
    const added = await request(
      '/passkeys',
      'POST',
      { response: registration, name: 'MacBook' },
      owner,
    )
    assert.equal(added.status, 201)
    assert.equal(added.body.name, 'MacBook')
    // The same answer again: the challenge is spent.
    assert.equal(
      (await request('/passkeys', 'POST', { response: registration }, owner))
        .status,
      400,
    )
    const keys = (await request('/passkeys', 'GET', undefined, owner)).body
    assert.deepEqual(
      keys.map((k) => [k.id, k.name]),
      [[device.id, 'MacBook']],
    )
    const signInWith = async (key, flags) => {
      const challenge = (await request('/auth/passkey/options', 'POST', {}))
        .body
      assert(!challenge.allowCredentials?.length)
      const response = key.sign(challenge, flags)
      return {
        response,
        result: await request('/auth/passkey', 'POST', { response }),
      }
    }
    const first = await signInWith(device)
    assert.equal(first.result.status, 200)
    assert.equal(first.result.body.id, 'owner')
    assert.equal((await me(first.result.cookie)).body.id, 'owner')
    assert(db.prepare('SELECT lastUsed FROM passkeys').get().lastUsed)
    // Replay, no user verification, unknown key: refused.
    assert.equal(
      (
        await request('/auth/passkey', 'POST', {
          response: first.response,
        })
      ).status,
      400,
    )
    assert.equal((await signInWith(device, 0x01)).result.status, 400)
    assert.equal(
      (await signInWith(authenticator('localhost'))).result.status,
      400,
    )
    // Without the role the key does not open the account.
    db.prepare(`UPDATE users SET roles='["teacher"]' WHERE id='owner'`).run()
    assert.equal((await signInWith(device)).result.status, 400)
    db.prepare(`UPDATE users SET roles='["owner"]' WHERE id='owner'`).run()
    // Only the owner of a key removes it.
    const remove = (cookie) =>
      request(
        `/passkeys/${encodeURIComponent(device.id)}`,
        'DELETE',
        {},
        cookie,
      )
    assert.equal((await remove(admin)).status, 404)
    assert.equal((await remove(first.result.cookie)).status, 200)
    assert.equal((await signInWith(device)).result.status, 400)
  } finally {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
