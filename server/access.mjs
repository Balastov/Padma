// Sign-in without Quazar and without a password (QUAZAR_SSO.md, stage 3.3):
// one-time login links and passkeys of owners and administrators.
import { createHash, randomBytes } from 'node:crypto'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { publicUser } from './store.mjs'
import { backupBefore } from './dbBackup.mjs'

export const LINK_TTL = 15 * 60000
const CHALLENGE_TTL = 5 * 60000
const PASSKEY_FAILED = 'Не удалось войти по ключу доступа'
const hash = (value) => createHash('sha256').update(value).digest('hex')
const isManager = (roles) =>
  roles.some((role) => role === 'owner' || role === 'admin')
const rolesOf = (row) => JSON.parse(row.roles)

export function initAccess(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS login_links (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id),
      createdBy TEXT REFERENCES users(id),
      created INTEGER NOT NULL,
      expires INTEGER NOT NULL,
      used INTEGER
    );
    CREATE TABLE IF NOT EXISTS passkeys (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id),
      publicKey BLOB NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT NOT NULL DEFAULT '[]',
      name TEXT NOT NULL,
      created INTEGER NOT NULL,
      lastUsed INTEGER
    );
    CREATE INDEX IF NOT EXISTS passkeys_user ON passkeys(userId);
    CREATE TABLE IF NOT EXISTS passkey_challenges (
      challenge TEXT PRIMARY KEY,
      userId TEXT,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`)
  // Password sign-in ends a month after the first start of this version.
  if (
    !db.prepare(`SELECT 1 FROM app_meta WHERE key='passwordDeadline'`).get()
  ) {
    const deadline = new Date()
    deadline.setMonth(deadline.getMonth() + 1)
    db.prepare(
      `INSERT INTO app_meta (key, value) VALUES ('passwordDeadline', ?)`,
    ).run(deadline.toISOString())
  }
}

export const passwordDeadline = (db) =>
  db.prepare(`SELECT value FROM app_meta WHERE key='passwordDeadline'`).get()
    ?.value || null

/** The deadline has come: password sign-in is over (stage 3.4). */
export const passwordsClosed = (db, now = Date.now()) => {
  const deadline = passwordDeadline(db)
  return Boolean(deadline) && now >= Date.parse(deadline)
}

/**
 * Once after the deadline: all password hashes go (a backup first). An account
 * without a password and a link is then linked by its number at the next
 * sign-in through Quazar. Returns how many passwords were erased.
 */
export function erasePasswords(db, path) {
  if (
    !passwordsClosed(db) ||
    db.prepare(`SELECT 1 FROM app_meta WHERE key='passwordsErased'`).get()
  )
    return 0
  const { n } = db
    .prepare(`SELECT COUNT(*) AS n FROM users WHERE password!=''`)
    .get()
  if (n) {
    const backup = backupBefore(db, path, 'passwords')
    if (backup)
      console.log('Резервная копия перед удалением паролей: ' + backup)
  }
  db.prepare(`UPDATE users SET password='' WHERE password!=''`).run()
  db.prepare(
    `INSERT INTO app_meta (key, value) VALUES ('passwordsErased', ?)`,
  ).run(new Date().toISOString())
  console.log(`Вход по паролю отключён, пароли стёрты: ${n}`)
  return n
}

/** Passkeys belong to the site name without «www.»: one key for both addresses. */
export const rpIdOf = (origins, env = process.env) =>
  env.PADMA_RP_ID || new URL(origins[0]).hostname.replace(/^www\./, '')

/**
 * One-time link: a session for this account, 15 minutes, once. Only the
 * SHA-256 of the token is stored. createdBy is null for the server script,
 * which may open any account; links from the site open only managers.
 */
export function createLoginLink(db, userId, createdBy, base) {
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  db.prepare('INSERT INTO login_links VALUES (?,?,?,?,?,NULL)').run(
    hash(token),
    userId,
    createdBy,
    now,
    now + LINK_TTL,
  )
  return {
    url: `${base.replace(/\/$/, '')}/api/auth/link?token=${token}`,
    expires: now + LINK_TTL,
  }
}

/** Handles login links and passkeys; true when the request was answered. */
export async function accessRoute({
  path,
  req,
  res,
  db,
  user,
  body,
  send,
  origins,
  rpID,
  startSession,
  countAttempt,
}) {
  const fail = (status, message) => {
    throw Object.assign(new Error(message), { status })
  }
  const now = Date.now()
  const activeUser = (id) =>
    db.prepare('SELECT * FROM users WHERE id=? AND archived=0').get(id)
  const takeChallenge = (challenge, userId) =>
    db
      .prepare(
        'DELETE FROM passkey_challenges WHERE challenge=? AND userId IS ? AND expires>?',
      )
      .run(challenge, userId, Date.now()).changes === 1
  const saveChallenge = (challenge, userId) => {
    db.prepare('DELETE FROM passkey_challenges WHERE expires<?').run(now)
    db.prepare('INSERT INTO passkey_challenges VALUES (?,?,?)').run(
      challenge,
      userId,
      now + CHALLENGE_TTL,
    )
  }

  if (path === '/api/auth/link' && req.method === 'GET') {
    const token =
      new URL(req.url, 'http://localhost').searchParams.get('token') || ''
    const link = db
      .prepare('SELECT * FROM login_links WHERE token=?')
      .get(hash(token))
    const target = link && activeUser(link.userId)
    const allowed =
      target &&
      link.expires > now &&
      (link.createdBy === null || isManager(rolesOf(target)))
    const used =
      allowed &&
      db
        .prepare('UPDATE login_links SET used=? WHERE token=? AND used IS NULL')
        .run(now, link.token).changes === 1
    res.writeHead(303, {
      Location: used ? '/' : '/?login=expired',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      ...(used ? { 'Set-Cookie': startSession(target.id) } : {}),
    })
    res.end()
    return true
  }

  if (path === '/api/auth/passkey/options' && req.method === 'POST') {
    countAttempt(req.socket.remoteAddress)
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
    })
    saveChallenge(options.challenge, null)
    send(200, options)
    return true
  }
  if (path === '/api/auth/passkey' && req.method === 'POST') {
    countAttempt(req.socket.remoteAddress)
    const { response } = await body(req)
    if (typeof response?.id !== 'string') fail(400, PASSKEY_FAILED)
    const key = db.prepare('SELECT * FROM passkeys WHERE id=?').get(response.id)
    const owner = key && activeUser(key.userId)
    if (!owner || !isManager(rolesOf(owner))) fail(400, PASSKEY_FAILED)
    let result
    try {
      result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: (challenge) => takeChallenge(challenge, null),
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: key.id,
          publicKey: new Uint8Array(key.publicKey),
          counter: key.counter,
          transports: JSON.parse(key.transports),
        },
      })
    } catch {
      fail(400, PASSKEY_FAILED)
    }
    if (!result.verified) fail(400, PASSKEY_FAILED)
    db.prepare('UPDATE passkeys SET counter=?, lastUsed=? WHERE id=?').run(
      result.authenticationInfo.newCounter,
      now,
      key.id,
    )
    send(200, publicUser(owner), { 'Set-Cookie': startSession(owner.id) })
    return true
  }

  if (!user) return false

  const loginLink = /^\/api\/users\/([^/]+)\/login-link$/.exec(path)
  if (loginLink && req.method === 'POST') {
    if (!isManager(user.roles))
      fail(403, 'Ссылку для входа выдаёт владелец или администратор')
    const target = activeUser(loginLink[1])
    if (!target) fail(404, 'Пользователь не найден')
    if (!isManager(rolesOf(target)))
      fail(403, 'Ссылка для входа — только для владельца или администратора')
    // Back to the address the request came from (padma.ru or www.padma.ru).
    const site = origins.includes(req.headers.origin)
      ? req.headers.origin
      : origins[0]
    send(200, createLoginLink(db, target.id, user.id, site))
    return true
  }

  if (path === '/api/passkeys' && req.method === 'GET') {
    send(
      200,
      db
        .prepare(
          'SELECT id, name, created, lastUsed FROM passkeys WHERE userId=? ORDER BY created',
        )
        .all(user.id),
    )
    return true
  }
  if (path.startsWith('/api/passkeys') && !isManager(user.roles))
    fail(403, 'Ключи доступа — для владельца и администраторов')
  if (path === '/api/passkeys/options' && req.method === 'POST') {
    const keys = db
      .prepare('SELECT id, transports FROM passkeys WHERE userId=?')
      .all(user.id)
    const options = await generateRegistrationOptions({
      rpName: 'Padma',
      rpID,
      userName: user.email || user.phone || user.id,
      userDisplayName: [user.name, user.surname].filter(Boolean).join(' '),
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: keys.map((k) => ({
        id: k.id,
        transports: JSON.parse(k.transports),
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
    })
    saveChallenge(options.challenge, user.id)
    send(200, options)
    return true
  }
  if (path === '/api/passkeys' && req.method === 'POST') {
    const data = await body(req)
    const name =
      (typeof data.name === 'string' ? data.name.trim().slice(0, 60) : '') ||
      'Ключ доступа'
    let result
    try {
      result = await verifyRegistrationResponse({
        response: data.response,
        expectedChallenge: (challenge) => takeChallenge(challenge, user.id),
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: true,
      })
    } catch {
      fail(400, 'Не удалось добавить ключ доступа')
    }
    if (!result.verified) fail(400, 'Не удалось добавить ключ доступа')
    const { credential } = result.registrationInfo
    try {
      db.prepare(
        'INSERT INTO passkeys (id,userId,publicKey,counter,transports,name,created) VALUES (?,?,?,?,?,?,?)',
      ).run(
        credential.id,
        user.id,
        Buffer.from(credential.publicKey),
        credential.counter,
        JSON.stringify(credential.transports || []),
        name,
        now,
      )
    } catch (error) {
      if (String(error).includes('UNIQUE')) fail(409, 'Этот ключ уже добавлен')
      throw error
    }
    send(201, { id: credential.id, name, created: now, lastUsed: null })
    return true
  }
  const passkey = /^\/api\/passkeys\/([^/]+)$/.exec(path)
  if (passkey && req.method === 'DELETE') {
    const { changes } = db
      .prepare('DELETE FROM passkeys WHERE id=? AND userId=?')
      .run(decodeURIComponent(passkey[1]), user.id)
    if (!changes) fail(404, 'Ключ не найден')
    send(200, { ok: true })
    return true
  }
  return false
}
