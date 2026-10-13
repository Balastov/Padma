import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword } from './store.mjs'

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  randomBytes(64),
])
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(64)])
const dataUrl = (mime, data) => `data:${mime};base64,${data.toString('base64')}`

test('background: per-teacher, default for others, permissions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-appearance-'))
  const { server, db } = createApp({ dbPath: join(dir, 'test.sqlite') })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const password = randomBytes(18).toString('hex'),
    hash = await hashPassword(password)
  for (const [id, roles, teacher] of [
    ['admin', ['admin'], null],
    ['teacher', ['teacher'], null],
    ['other', ['teacher'], null],
    ['student', ['student'], 'teacher'],
    ['outsider', ['student'], 'other'],
  ])
    db.prepare(
      'INSERT INTO users (id,name,email,password,roles,teacherId) VALUES (?,?,?,?,?,?)',
    ).run(id, id, `${id}@example.test`, hash, JSON.stringify(roles), teacher)

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
    const type = res.headers.get('content-type') || ''
    return {
      status: res.status,
      type,
      cache: res.headers.get('cache-control'),
      body: type.includes('json')
        ? await res.json()
        : Buffer.from(await res.arrayBuffer()),
    }
  }
  async function login(id) {
    const res = await fetch(base + '/login', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: `${id}@example.test`, password }),
    })
    assert.equal(res.status, 200)
    return res.headers.get('set-cookie').split(';')[0]
  }
  const relative = (url) => url.replace(/^\/api/, '')
  try {
    assert.deepEqual((await request('/appearance/public')).body, {
      active: null,
    })
    assert.equal((await request('/appearance/image/default')).status, 404)
    assert.equal((await request('/appearance')).status, 401)

    const admin = await login('admin')
    const teacher = await login('teacher')
    const student = await login('student')
    const outsider = await login('outsider')

    const png64 = dataUrl('image/png', png)
    assert.equal(
      (await request('/appearance/mine', 'PUT', { image: png64 }, student)).status,
      403,
    )
    assert.equal(
      (await request('/appearance/mine', 'PUT', { image: png64 }, admin)).status,
      403,
    )
    assert.equal(
      (await request('/appearance/default', 'PUT', { image: png64 }, teacher))
        .status,
      403,
    )
    for (const bad of [
      {},
      { image: 'data:image/gif;base64,R0lGOD' },
      { image: dataUrl('image/png', jpeg) },
      { image: png64, blur: 100 },
      { image: png64, tint: '5' },
      { image: dataUrl('image/jpeg', Buffer.alloc(5 * 1024 * 1024 + 1, 0xff)) },
    ])
      assert.equal(
        (await request('/appearance/mine', 'PUT', bad, teacher)).status,
        400,
      )

    const saved = await request(
      '/appearance/mine',
      'PUT',
      { image: png64, blur: 10, tint: 20 },
      teacher,
    )
    assert.equal(saved.status, 200)
    assert.equal(saved.body.blur, 10)
    assert.equal(saved.body.tint, 20)

    const mine = await request('/appearance', 'GET', undefined, teacher)
    assert.equal(mine.body.source, 'mine')
    assert.equal(mine.body.canEditMine, true)
    assert.equal(mine.body.canEditDefault, false)
    assert.equal(mine.body.default, undefined)

    const seen = await request('/appearance', 'GET', undefined, student)
    assert.equal(seen.body.source, 'teacher')
    assert.equal(seen.body.active.url, saved.body.url)
    assert.equal(seen.body.canEditMine, false)
    const img = await request(relative(saved.body.url), 'GET', undefined, student)
    assert.equal(img.status, 200)
    assert.equal(img.type, 'image/png')
    assert.match(img.cache, /private/)
    assert.deepEqual(img.body, png)
    assert.equal(
      (await request(relative(saved.body.url), 'GET', undefined, outsider)).status,
      404,
    )
    assert.deepEqual(
      (await request('/appearance', 'GET', undefined, outsider)).body.active,
      null,
    )

    const def = await request(
      '/appearance/default',
      'PUT',
      { image: dataUrl('image/jpeg', jpeg) },
      admin,
    )
    assert.equal(def.status, 200)
    assert.equal(def.body.blur, 24)
    assert.equal(def.body.tint, 35)
    const outsiderNow = await request('/appearance', 'GET', undefined, outsider)
    assert.equal(outsiderNow.body.source, 'default')
    const adminView = await request('/appearance', 'GET', undefined, admin)
    assert.equal(adminView.body.source, 'default')
    assert.equal(adminView.body.mine, undefined)
    assert.equal(adminView.body.default.url, def.body.url)
    assert.equal((await request('/appearance/public')).body.active.url, def.body.url)
    const publicImg = await request(relative(def.body.url))
    assert.equal(publicImg.type, 'image/jpeg')
    assert.match(publicImg.cache, /public/)

    // Sliders only: image kept, unspecified values kept.
    const tuned = await request('/appearance/mine', 'PUT', { blur: 40 }, teacher)
    assert.equal(tuned.body.blur, 40)
    assert.equal(tuned.body.tint, 20)
    assert.notEqual(tuned.body.url, saved.body.url)
    assert.deepEqual(
      (await request(relative(tuned.body.url), 'GET', undefined, teacher)).body,
      png,
    )

    assert.equal(
      (await request('/appearance/mine', 'DELETE', undefined, teacher)).status,
      200,
    )
    const fallback = await request('/appearance', 'GET', undefined, student)
    assert.equal(fallback.body.source, 'default')
    assert.equal(fallback.body.active.url, def.body.url)
  } finally {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
