import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword } from './store.mjs'

test('push subscriptions and notificationsEnabled permissions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-push-'))
  const dbPath = join(dir, 'test.sqlite')
  const { server, db } = createApp({ dbPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const password = randomBytes(18).toString('hex'),
    hash = await hashPassword(password)
  for (const [id, roles, teacher] of [
    ['owner', ['owner'], null],
    ['admin', ['admin'], null],
    ['teacher', ['teacher'], null],
    ['student', ['student'], 'teacher'],
  ]) {
    db.prepare(
      'INSERT INTO users (id,name,email,password,roles,teacherId) VALUES (?,?,?,?,?,?)',
    ).run(id, id, `${id}@example.test`, hash, JSON.stringify(roles), teacher)
  }
  async function request(path, method = 'GET', body, cookie = '') {
    const res = await fetch(base + path, {
      method,
      headers: {
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return {
      status: res.status,
      body: await res.json(),
      cookie: res.headers.get('set-cookie'),
    }
  }
  async function login(id) {
    const res = await request('/login', 'POST', {
      email: `${id}@example.test`,
      password,
    })
    assert.equal(res.status, 200)
    return res.cookie.split(';')[0]
  }
  try {
    const student = await login('student')
    const teacher = await login('teacher')
    const owner = await login('owner')
    const admin = await login('admin')

    const vapid = await request('/push/vapid-public-key', 'GET', undefined, student)
    assert.equal(vapid.status, 200)
    assert.equal(typeof vapid.body.publicKey, 'string')
    assert.ok(vapid.body.publicKey.length > 20)

    const me = await request('/me', 'GET', undefined, student)
    assert.equal(me.body.notificationsEnabled, false)

    const enabled = await request(
      '/profile',
      'PATCH',
      {
        name: 'student',
        surname: '',
        email: 'student@example.test',
        phone: '',
        photo: '',
        notificationsEnabled: true,
      },
      student,
    )
    assert.equal(enabled.status, 200)
    assert.equal(enabled.body.notificationsEnabled, true)

    const sub = await request(
      '/push/subscribe',
      'POST',
      {
        endpoint: 'https://push.example/student-1',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      },
      student,
    )
    assert.equal(sub.status, 200)
    assert.equal(
      db
        .prepare('SELECT userId FROM push_subscriptions WHERE endpoint=?')
        .get('https://push.example/student-1').userId,
      'student',
    )

    const denied = await request(
      '/users/owner',
      'PATCH',
      {
        name: 'owner',
        surname: '',
        email: 'owner@example.test',
        phone: '',
        photo: '',
        roles: ['owner'],
        teacherId: null,
        notificationsEnabled: true,
      },
      teacher,
    )
    assert.equal(denied.status, 403)

    const ownerPatch = await request(
      '/users/admin',
      'PATCH',
      {
        name: 'admin',
        surname: '',
        email: 'admin@example.test',
        phone: '',
        photo: '',
        roles: ['admin'],
        teacherId: null,
        notificationsEnabled: true,
      },
      owner,
    )
    assert.equal(ownerPatch.status, 200)
    assert.equal(ownerPatch.body.notificationsEnabled, true)

    const studentByTeacher = await request(
      '/users/student',
      'PATCH',
      {
        name: 'student',
        surname: '',
        email: 'student@example.test',
        phone: '',
        photo: '',
        roles: ['student'],
        teacherId: 'teacher',
        notificationsEnabled: false,
      },
      teacher,
    )
    assert.equal(studentByTeacher.status, 200)
    assert.equal(studentByTeacher.body.notificationsEnabled, false)

    const unsub = await request(
      '/push/subscribe',
      'DELETE',
      { endpoint: 'https://push.example/student-1' },
      student,
    )
    assert.equal(unsub.status, 200)
    assert.equal(
      db
        .prepare('SELECT count(*) AS n FROM push_subscriptions WHERE endpoint=?')
        .get('https://push.example/student-1').n,
      0,
    )

    void admin
  } finally {
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})
