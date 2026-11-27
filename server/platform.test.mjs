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
          phone: '89001234567',
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
    assert.deepEqual(
      teacherList.body.map((u) => u.id).sort(),
      ['guest', 'other', 'outsider', 'owner', 'student', 'teacher'],
    )
    assert(teacherList.body.every((u) => !('password' in u)))
    const ownerList = await request('/users', 'GET', undefined, owner)
    assert.equal(ownerList.body.length, teacherList.body.length)
    const updatedProfile = await request(
      '/profile',
      'PATCH',
      {
        name: 'Обновлённый учитель',
        surname: '',
        email: 'teacher@example.test',
        phone: '',
        photo: '',
        roles: ['owner'],
      },
      teacher,
    )
    assert.equal(updatedProfile.status, 200)
    assert.equal(updatedProfile.body.name, 'Обновлённый учитель')
    assert.deepEqual(updatedProfile.body.roles, ['teacher'])
    assert.equal(
      (
        await request(
          '/profile',
          'PATCH',
          {
            name: 'Учитель',
            email: 'teacher@example.test',
            phone: '',
            photo: '',
            password: randomUUID(),
            currentPassword: 'wrong',
          },
          teacher,
        )
      ).status,
      400,
    )
    const ownerProfile = await request(
      '/profile',
      'PATCH',
      {
        name: 'Owner',
        surname: '',
        email: 'owner@example.test',
        phone: '+79001112233',
        photo: '',
        roles: ['owner', 'teacher'],
        teacherId: null,
      },
      owner,
    )
    assert.equal(ownerProfile.status, 200)
    assert.equal(ownerProfile.body.phone, '+79001112233')
    assert.deepEqual(ownerProfile.body.roles.sort(), ['owner', 'teacher'])
    // Nobody creates accounts: people sign up through Quazar.
    for (const who of [teacher, owner])
      assert.equal(
        (
          await request(
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
            who,
          )
        ).status,
        403,
      )
    db.prepare(
      'INSERT INTO users (id,name,surname,email,password,roles,teacherId) VALUES (?,?,?,?,?,?,?)',
    ).run(
      'newbie',
      'Новый',
      'Ученик',
      'new@example.test',
      hash,
      JSON.stringify(['student']),
      'teacher',
    )
    const created = {
      body: (await request('/users', 'GET', undefined, teacher)).body.find(
        (u) => u.id === 'newbie',
      ),
    }
    assert.equal(created.body.timeZone, 'Europe/Moscow')
    const studentProfile = {
      name: 'student',
      email: 'student@example.test',
      phone: '',
      photo: '',
    }
    const zoned = await request(
      '/profile',
      'PATCH',
      { ...studentProfile, timeZone: 'Asia/Yekaterinburg' },
      student,
    )
    assert.equal(zoned.status, 200)
    assert.equal(zoned.body.timeZone, 'Asia/Yekaterinburg')
    for (const timeZone of ['Mars/Olympus', '', 'Europe/Moscow; DROP', 3])
      assert.equal(
        (
          await request(
            '/profile',
            'PATCH',
            { ...studentProfile, timeZone },
            student,
          )
        ).status,
        400,
      )
    const keptZone = await request('/profile', 'PATCH', studentProfile, student)
    assert.equal(keptZone.body.timeZone, 'Asia/Yekaterinburg')
    const teacherZoned = await request(
      '/users/student',
      'PATCH',
      {
        ...studentProfile,
        roles: ['student'],
        teacherId: 'teacher',
        timeZone: 'Asia/Vladivostok',
      },
      teacher,
    )
    assert.equal(teacherZoned.status, 200)
    assert.equal(teacherZoned.body.timeZone, 'Asia/Vladivostok')
    // The teacher edits own students; numbers are stored in E.164.
    const edit = (data, who = teacher) =>
      request(
        '/users/newbie',
        'PATCH',
        { ...created.body, ...data, roles: ['student'], teacherId: 'teacher' },
        who,
      )
    const phoneOnly = await edit({ email: '', phone: '+7 (901) 234-56-78' })
    assert.equal(phoneOnly.status, 200)
    assert.equal(phoneOnly.body.email, '')
    assert.equal(phoneOnly.body.phone, '+79012345678')
    assert.equal(
      (
        await request('/login', 'POST', {
          phone: '8 901 234-56-78',
          password,
        })
      ).status,
      200,
    )
    const abroad = await edit({ email: '', phone: '+44 7911 123456' })
    assert.equal(abroad.status, 200)
    assert.equal(abroad.body.phone, '+447911123456')
    assert.equal(abroad.body.phoneNeedsFix, false)
    assert.equal(
      (await request('/login', 'POST', { phone: '00447911123456', password }))
        .status,
      200,
    )
    // +7 is taken by length, as in Quazar (Kazakhstan too).
    assert.equal(
      (await edit({ phone: '+7 701 234 56 78' })).body.phone,
      '+77012345678',
    )
    for (const phone of ['+44 12', '+999 123 456 789', '12345'])
      assert.equal((await edit({ phone })).status, 400)
    assert.equal((await edit({ password: 'short' })).status, 400)
    assert.equal((await edit({ email: '', phone: '' })).status, 400)
    // A teacher neither raises roles nor hands the student to another teacher.
    assert.equal(
      (
        await request(
          '/users/newbie',
          'PATCH',
          { ...created.body, roles: ['owner'], teacherId: 'teacher' },
          teacher,
        )
      ).status,
      403,
    )
    assert.equal(
      (
        await request(
          '/users/newbie',
          'PATCH',
          { ...created.body, roles: ['student'], teacherId: 'other' },
          teacher,
        )
      ).status,
      403,
    )
    assert.equal(
      (await edit({ email: 'new@example.test', phone: '' })).status,
      200,
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
      recurrence: {
        everyWeeks: 1,
        days: [{ weekday: 4, start: '14:00', end: '14:50' }],
        endType: 'count',
        count: 3,
      },
    }
    assert.equal(
      (await request('/lessons', 'POST', event, student)).status,
      403,
    )
    assert.equal((await request('/lessons', 'POST', event, other)).status, 403)
    assert.equal(
      (
        await request(
          '/lessons',
          'POST',
          { ...event, end: '13:00', recurrence: undefined },
          teacher,
        )
      ).status,
      400,
    )
    assert.equal(
      (
        await request(
          '/lessons',
          'POST',
          {
            ...event,
            recurrence: {
              ...event.recurrence,
              days: [{ weekday: 4, start: '14:00', end: '13:00' }],
            },
          },
          teacher,
        )
      ).status,
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
      403,
    )
    assert.equal(
      (
        await request('/messages/teacher', 'POST', { text: 'Привет' }, student)
      ).status,
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
      (await request('/messages/teacher', 'GET', undefined, student)).body
        .length,
      1,
    )
    // other teacher: not assigned to student → no access; own outsider ok
    assert.equal(
      (await request('/messages/student', 'GET', undefined, other)).status,
      403,
    )
    assert.equal(
      (await request('/messages/outsider', 'GET', undefined, other)).status,
      200,
    )
    assert.equal(
      (await request('/messages/owner', 'GET', undefined, teacher)).status,
      200,
    )
    assert.equal(
      (await request('/messages/student', 'GET', undefined, owner)).status,
      200,
    )
    assert.equal(
      (await request('/messages/outsider', 'GET', undefined, teacher)).status,
      403,
    )
    const teacherPeers = await request('/chat-peers', 'GET', undefined, teacher)
    assert.equal(teacherPeers.status, 200)
    const teacherPeerIds = teacherPeers.body.map((u) => u.id)
    assert.ok(teacherPeerIds.includes('student'))
    assert.ok(teacherPeerIds.includes('owner'))
    assert.ok(teacherPeerIds.includes('other'))
    assert.ok(!teacherPeerIds.includes('outsider'))
    assert.ok(!teacherPeerIds.includes('guest'))
    assert.ok(!teacherPeerIds.includes('teacher'))
    const studentPeers = await request('/chat-peers', 'GET', undefined, student)
    assert.deepEqual(
      studentPeers.body.map((u) => u.id),
      ['teacher'],
    )
    const ownerPeers = await request('/chat-peers', 'GET', undefined, owner)
    assert.ok(ownerPeers.body.length >= 5)
    assert.ok(!ownerPeers.body.some((u) => u.id === 'owner'))
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
  // The deleted lesson of a 3-lesson package is replaced at the end.
  assert.equal(
    reopened.db.prepare('SELECT count(*) AS n FROM lessons').get().n,
    3,
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
