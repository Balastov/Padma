import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword } from './store.mjs'

test('unread messages: counts, addressees, read marks and isolation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-unread-'))
  const dbPath = join(dir, 'test.sqlite')
  const app = createApp({ dbPath })
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${app.server.address().port}/api`
  const password = randomBytes(20).toString('hex'),
    hash = await hashPassword(password)
  const people = [
    ['owner', 'Ольга', ['owner'], null],
    ['teacher', 'Анна', ['teacher'], null],
    ['other', 'Борис', ['teacher'], null],
    ['student', 'Иван', ['student'], 'teacher'],
    ['second', 'Мария', ['student'], 'other'],
  ]
  for (const [id, name, roles, teacher] of people)
    app.db
      .prepare(
        'INSERT INTO users (id,name,email,password,roles,teacherId) VALUES (?,?,?,?,?,?)',
      )
      .run(id, name, id + '@example.test', hash, JSON.stringify(roles), teacher)
  const cookies = {}
  const req = async (path, who, method = 'GET', data) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        Cookie: cookies[who] || '',
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
    return { status: r.status, body: await r.json() }
  }
  const unread = async (who) => (await req('/messages/unread', who)).body
  const say = async (from, to, text) => {
    const r = await req('/messages/' + to, from, 'POST', { text })
    assert.equal(r.status, 201)
    // Distinct timestamps keep the order of messages stable.
    await new Promise((resolve) => setTimeout(resolve, 5))
    return r.body
  }
  try {
    for (const [id] of people) {
      const r = await fetch(base + '/login', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:5173',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: id + '@example.test', password }),
      })
      cookies[id] = r.headers.get('set-cookie').split(';')[0]
    }
    assert.equal((await req('/messages/unread', '')).status, 401)
    // Messages from before the feature count as read.
    app.db
      .prepare(
        'INSERT INTO messages (id, studentId, senderId, text, created, threadKey) VALUES (?,?,?,?,?,?)',
      )
      .run(
        'old',
        'student',
        'student',
        'старое',
        '2020-01-01T00:00:00.000Z',
        'student',
      )
    for (const [id] of people)
      assert.deepEqual(await unread(id), { total: 0, peers: {}, latest: null })

    // A student writes only to their teacher: the shared thread does not
    // make it unread for the owner.
    await say('student', 'teacher', 'Здравствуйте')
    const last = await say('student', 'teacher', 'Я сделал ДЗ')
    let t = await unread('teacher')
    assert.equal(t.total, 2)
    assert.deepEqual(t.peers, { student: 2 })
    assert.equal(t.latest.id, last.id)
    assert.equal(t.latest.peerId, 'student')
    assert.equal(t.latest.senderName, 'Иван')
    assert.equal(t.latest.text, 'Я сделал ДЗ')
    for (const who of ['owner', 'other', 'student', 'second'])
      assert.equal((await unread(who)).total, 0)

    // Opening the thread reads it.
    assert.equal((await req('/messages/student', 'teacher')).status, 200)
    assert.equal((await unread('teacher')).total, 0)

    // Staff messages in the student thread are all for the student.
    await say('teacher', 'student', 'Отлично')
    await say('owner', 'student', 'Добро пожаловать')
    let s = await unread('student')
    assert.equal(s.total, 2)
    assert.deepEqual(s.peers, { teacher: 2 })
    assert.equal(s.latest.senderName, 'Ольга')
    assert.equal((await unread('teacher')).total, 0)
    assert.equal((await unread('owner')).total, 0)
    // Replying marks earlier messages as read.
    await say('student', 'teacher', 'Спасибо')
    assert.equal((await unread('student')).total, 0)
    assert.equal((await unread('teacher')).total, 1)

    // Pair threads between staff.
    await say('other', 'teacher', 'Коллега, привет')
    t = await unread('teacher')
    assert.equal(t.total, 2)
    assert.deepEqual(t.peers, { student: 1, other: 1 })
    assert.equal(t.latest.peerId, 'other')
    assert.equal((await unread('owner')).total, 0)
    assert.equal((await unread('second')).total, 0)

    // Someone else's thread cannot be read to clear counters.
    assert.equal((await req('/messages/student', 'second')).status, 403)
    assert.equal((await unread('teacher')).total, 2)

    // Read marks survive a restart.
    await req('/messages/other', 'teacher')
    await new Promise((r) => app.server.close(r))
    const reopened = createApp({ dbPath })
    await new Promise((r) => reopened.server.listen(0, '127.0.0.1', r))
    const port = reopened.server.address().port
    const again = await fetch(`http://127.0.0.1:${port}/api/messages/unread`, {
      headers: { Cookie: cookies.teacher },
    })
    assert.deepEqual((await again.json()).peers, { student: 1 })
    await new Promise((r) => reopened.server.close(r))
  } finally {
    if (app.server.listening) await new Promise((r) => app.server.close(r))
    rmSync(dir, { recursive: true, force: true })
  }
})
