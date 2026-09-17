import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, randomBytes } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword } from './store.mjs'

test('authentication, permissions, persistence, scheduling and chat', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-test-'))
  const dbPath = join(dir, 'test.sqlite')
  const { server, db } = createApp({ dbPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const password = randomBytes(18).toString('hex'),
    hash = await hashPassword(password)
  for (const [id, roles, teacher] of [
    ['owner', ['owner', 'teacher'], null],
    ['teacher', ['teacher'], null],
    ['other', ['teacher'], null],
    ['student', ['student'], 'teacher'],
    ['outsider', ['student'], 'other'],
    ['guest', ['guest'], null],
  ]) {
    db.prepare(
      'INSERT INTO users (id,name,email,password,roles,teacherId) VALUES (?,?,?,?,?,?)',
    ).run(id, id, `${id}@example.test`, hash, JSON.stringify(roles), teacher)
  }
  async function request(
    path,
    method = 'GET',
    body,
    cookie = '',
    origin = 'http://localhost:5173',
  ) {
    const res = await fetch(base + path, {
      method,
      headers: {
        Origin: origin,
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
    assert(!('password' in res.body))
    assert.match(res.cookie, /HttpOnly/)
    assert.match(res.cookie, /SameSite=Strict/)
    return res.cookie.split(';')[0]
  }
  try {
    assert.deepEqual((await request('/health')).body, { ok: true })
    assert.equal((await request('/users')).status, 401)
    assert.equal(
      (
        await request('/login', 'POST', {
          email: 'owner@example.test',
          password: 'incorrect',
        })
      ).status,
      401,
    )
    assert.equal(
      (
        await request(
          '/login',
          'POST',
          { email: 'owner@example.test', password },
          '',
          'https://evil.example',
        )
      ).status,
      403,
    )
    db.prepare('UPDATE users SET phone=? WHERE id=?').run(
      '+79001234567',
      'student',
    )
    assert.equal(
      (
        await request('/login', 'POST', {
          phone: '+7 (900) 123-45-67',
          password,
        })
      ).status,
      200,
    )
    assert.equal(
      (
        await request('/login', 'POST', {
          phone: '+79001234567',
          password: 'incorrect',
        })
      ).status,
      401,
    )
    const owner = await login('owner'),
      teacher = await login('teacher'),
      student = await login('student'),
      other = await login('other'),
      guest = await login('guest')
    assert.equal(
      (await request('/users', 'GET', undefined, student)).status,
      403,
    )
    assert.equal((await request('/users', 'GET', undefined, guest)).status, 403)
    const teacherList = await request('/users', 'GET', undefined, teacher)
    assert.deepEqual(teacherList.body.map((u) => u.id).sort(), [
      'student',
      'teacher',
    ])
    assert(teacherList.body.every((u) => !('password' in u)))
    const updatedProfile = await request(
      '/profile',
      'PATCH',
      { name: 'Обновлённый учитель', surname: '', photo: '', roles: ['owner'] },
      teacher,
    )
    assert.equal(updatedProfile.status, 200)
    assert.deepEqual(updatedProfile.body.roles, ['teacher'])
    assert.equal(
      (
        await request(
          '/profile',
          'PATCH',
          { name: 'Учитель', password: randomUUID(), currentPassword: 'wrong' },
          teacher,
        )
      ).status,
      400,
    )
    const created = await request(
      '/users',
      'POST',
      {
        name: 'Новый',
        surname: 'Ученик',
        email: 'new@example.test',
        password,
        roles: ['student'],
        teacherId: 'teacher',
      },
      teacher,
    )
    assert.equal(created.status, 201)
    assert.equal(
      (
        await request(
          '/users',
          'POST',
          {
            name: 'Escalation',
            email: 'bad@example.test',
            password,
            roles: ['owner'],
            teacherId: 'teacher',
          },
          teacher,
        )
      ).status,
      403,
    )
    assert.equal(
      (await request('/users/' + created.body.id, 'DELETE', {}, teacher))
        .status,
      403,
    )
    assert.equal(
      (
        await request(
          '/users/outsider',
          'PATCH',
          { ...created.body, email: 'newer@example.test' },
          teacher,
        )
      ).status,
      403,
    )
    const event = {
      studentId: 'student',
      date: '2027-04-01',
      start: '14:00',
      end: '14:50',
      title: 'Practice',
      repeat: true,
      weeks: 3,
    }
    assert.equal(
      (await request('/lessons', 'POST', event, student)).status,
      403,
    )
    assert.equal((await request('/lessons', 'POST', event, other)).status, 403)
    assert.equal(
      (await request('/lessons', 'POST', { ...event, end: '13:00' }, teacher))
        .status,
      400,
    )
    assert.equal(
      (
        await request(
          '/lessons',
          'POST',
          { ...event, date: '2027-02-30' },
          teacher,
        )
      ).status,
      400,
    )
    const lessons = await request('/lessons', 'POST', event, teacher)
    assert.equal(lessons.status, 201)
    assert.equal(lessons.body.length, 3)
    assert.equal(
      (await request('/lessons', 'POST', event, teacher)).status,
      409,
    )
    assert.equal(
      (await request('/lessons', 'GET', undefined, student)).body.length,
      3,
    )
    assert.equal(
      (await request('/lessons', 'GET', undefined, other)).body.length,
      0,
    )
    // A collision in a later repetition must roll back earlier inserts.
    const conflict = await request(
      '/lessons',
      'POST',
      { ...event, date: '2027-03-25' },
      teacher,
    )
    assert.equal(conflict.status, 409)
    assert.equal(
      (await request('/lessons', 'GET', undefined, teacher)).body.length,
      3,
    )
    assert.equal(
      (await request('/messages/student', 'POST', { text: 'Привет' }, student))
        .status,
      201,
    )
    assert.equal(
      (await request('/messages/student', 'POST', { text: '   ' }, teacher))
        .status,
      400,
    )
    assert.equal(
      (await request('/messages/student', 'GET', undefined, teacher)).body
        .length,
      1,
    )
    assert.equal(
      (await request('/messages/student', 'GET', undefined, other)).status,
      403,
    )
    assert.equal(
      (await request('/messages/student', 'GET', undefined, guest)).status,
      403,
    )
    assert.equal(
      (await request('/users/' + created.body.id, 'DELETE', {}, owner)).status,
      200,
    )
    assert.equal(
      (await request('/login', 'POST', { email: 'new@example.test', password }))
        .status,
      401,
    )
    assert.equal(
      (
        await request(
          '/users/owner',
          'PATCH',
          {
            name: 'owner',
            email: 'owner@example.test',
            roles: ['teacher'],
            teacherId: null,
            photo: '',
          },
          owner,
        )
      ).status,
      400,
    )
    assert.equal(
      (await request('/lessons/' + lessons.body[0].id, 'DELETE', {}, student))
        .status,
      403,
    )
    assert.equal(
      (await request('/lessons/' + lessons.body[0].id, 'DELETE', {}, teacher))
        .status,
      200,
    )
    await request('/logout', 'POST', {}, student)
    assert.equal((await request('/me', 'GET', undefined, student)).status, 401)
    const updated = await request(
      '/users/student',
      'PATCH',
      {
        name: 'student',
        email: 'student@example.test',
        roles: ['student'],
        teacherId: 'teacher',
        password: randomUUID(),
      },
      owner,
    )
    assert.equal(updated.status, 200)
    assert.equal(
      (
        await request('/login', 'POST', {
          email: 'student@example.test',
          password,
        })
      ).status,
      401,
    )
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
  const reopened = createApp({ dbPath })
  assert.equal(
    reopened.db.prepare('SELECT count(*) AS n FROM lessons').get().n,
    2,
  )
  assert.equal(
    reopened.db.prepare('SELECT count(*) AS n FROM messages').get().n,
    1,
  )
  assert.equal(
    reopened.db
      .prepare('SELECT archived FROM users WHERE email=?')
      .get('new@example.test').archived,
    1,
  )
  reopened.db.close()
  rmSync(dir, { recursive: true, force: true })
})

test('Moscow calendar stays independent of browser/system timezone', async () => {
  const { moscowToday, dateKey, weekDays, lessonIsUpcoming } =
    await import('../src/api.ts')
  const originalTZ = process.env.TZ
  try {
    process.env.TZ = 'America/Los_Angeles'
    const expected = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
    assert.equal(dateKey(moscowToday()), expected)
    assert.deepEqual(weekDays(new Date('2026-09-20T12:00:00')).map(dateKey), [
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ])
    assert.equal(lessonIsUpcoming({ date: '2000-01-01', end: '10:00' }), false)
    assert.equal(lessonIsUpcoming({ date: '2099-01-01', end: '10:00' }), true)
  } finally {
    if (originalTZ === undefined) delete process.env.TZ
    else process.env.TZ = originalTZ
  }
})

test('calendar lays out simultaneous teachers without hiding events', async () => {
  const { layoutDay } = await import('../src/calendarLayout.ts')
  const events = [
    { id: 'a', start: '10:00', end: '11:00' },
    { id: 'b', start: '10:30', end: '11:30' },
    { id: 'c', start: '11:00', end: '11:50' },
    { id: 'd', start: '12:00', end: '13:00' },
  ]
  const result = layoutDay(events)
  assert.equal(result.length, 4)
  assert.deepEqual(
    result.map(({ lane, lanes }) => [lane, lanes]),
    [
      [0, 2],
      [1, 2],
      [0, 2],
      [0, 1],
    ],
  )
})
