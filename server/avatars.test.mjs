import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword } from './store.mjs'
import {
  PRESET_AVATARS,
  assignStudentAvatars,
  isPresetAvatar,
} from './avatars.mjs'

test('preset avatar files exist and match the client list', () => {
  for (const path of PRESET_AVATARS)
    assert(existsSync(join('public', path)), path)
  const client = readFileSync('src/avatars.ts', 'utf8')
  assert.match(client, /length: 15/)
  assert.match(
    client,
    /\/avatars\/animal-\$\{String\(i \+ 1\)\.padStart\(2, '0'\)\}\.jpg/,
  )
})

test('students get random preset avatars, once and on save', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-avatars-'))
  const app = createApp({ dbPath: join(dir, 'test.sqlite') })
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${app.server.address().port}/api`
  const password = randomBytes(20).toString('hex'),
    hash = await hashPassword(password)
  const custom = 'data:image/png;base64,iVBORw0KGgo='
  const insert = app.db.prepare(
    'INSERT INTO users (id,name,email,password,roles,teacherId,photo) VALUES (?,?,?,?,?,?,?)',
  )
  for (const [id, roles, teacher, photo] of [
    ['teacher', ['teacher'], null, ''],
    ['plain', ['student'], 'teacher', ''],
    ['other', ['student'], 'teacher', ''],
    ['own', ['student'], 'teacher', custom],
  ])
    insert.run(
      id,
      id,
      id + '@example.test',
      hash,
      JSON.stringify(roles),
      teacher,
      photo,
    )
  const photoOf = (id) =>
    app.db.prepare('SELECT photo FROM users WHERE id=?').get(id).photo
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
  try {
    // Existing users: the startup pass already ran on the empty database.
    assert.equal(assignStudentAvatars(app.db), 0)
    app.db.prepare(`DELETE FROM app_meta WHERE key='studentAvatars'`).run()
    assert.equal(assignStudentAvatars(app.db), 2)
    assert(isPresetAvatar(photoOf('plain')))
    assert(isPresetAvatar(photoOf('other')))
    // Spread over the set: two students never share one from a fresh deck.
    assert.notEqual(photoOf('plain'), photoOf('other'))
    assert.equal(photoOf('own'), custom)
    assert.equal(photoOf('teacher'), '')
    app.db.prepare(`UPDATE users SET photo='' WHERE id='plain'`).run()
    assert.equal(assignStudentAvatars(app.db), 0)
    assert.equal(photoOf('plain'), '')

    for (const id of ['teacher', 'plain']) {
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
    const profile = (who, photo) =>
      req('/profile', who, 'PATCH', {
        name: who,
        surname: '',
        email: who + '@example.test',
        phone: '',
        photo,
      })
    // A student picks from the set, uploads their own or gets a random one.
    let r = await profile('plain', PRESET_AVATARS[3])
    assert.equal(r.status, 200)
    assert.equal(r.body.photo, PRESET_AVATARS[3])
    for (const bad of [
      '/avatars/animal-99.jpg',
      'https://example.test/cat.jpg',
      '/avatars/../padma.sqlite',
    ])
      assert.equal((await profile('plain', bad)).status, 400)
    assert.equal((await profile('plain', custom)).body.photo, custom)
    r = await profile('plain', '')
    assert(isPresetAvatar(r.body.photo))
    // Staff may stay without a photo.
    assert.equal((await profile('teacher', '')).body.photo, '')

    // New students get an avatar; the teacher can change it.
    r = await req('/users', 'teacher', 'POST', {
      name: 'Новый',
      email: 'new@example.test',
      roles: ['student'],
      teacherId: 'teacher',
      password: 'password-123',
    })
    assert.equal(r.status, 201)
    assert(isPresetAvatar(r.body.photo))
    r = await req('/users/' + r.body.id, 'teacher', 'PATCH', {
      ...r.body,
      photo: PRESET_AVATARS[14],
    })
    assert.equal(r.status, 200)
    assert.equal(r.body.photo, PRESET_AVATARS[14])
  } finally {
    if (app.server.listening) await new Promise((r) => app.server.close(r))
    rmSync(dir, { recursive: true, force: true })
  }
})
