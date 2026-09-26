import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword } from './store.mjs'

test('vocab CRUD, audio upload, student forbidden, tts without key', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-vocab-'))
  const dbPath = join(dir, 'test.sqlite')
  const prevKey = process.env.OPENAI_API_KEY
  delete process.env.OPENAI_API_KEY
  const { server, db } = createApp({ dbPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const password = randomBytes(18).toString('hex'),
    hash = await hashPassword(password)
  for (const [id, roles, teacher] of [
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
    const type = res.headers.get('content-type') || ''
    return {
      status: res.status,
      body: type.includes('application/json')
        ? await res.json()
        : Buffer.from(await res.arrayBuffer()),
      cookie: res.headers.get('set-cookie'),
      type,
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
    const teacher = await login('teacher')
    const student = await login('student')

    assert.equal((await request('/vocab')).status, 401)

    const denied = await request(
      '/vocab',
      'POST',
      { word: 'hello', transcription: '/həˈləʊ/' },
      student,
    )
    assert.equal(denied.status, 403)

    const tinyMp3 = Buffer.from('ID3fake-audio-bytes-for-test!!')
    const created = await request(
      '/vocab',
      'POST',
      {
        word: 'hello',
        transcription: '/həˈləʊ/',
        translation: 'привет',
        audio: `data:audio/mpeg;base64,${tinyMp3.toString('base64')}`,
      },
      teacher,
    )
    assert.equal(created.status, 201)
    assert.equal(created.body.word, 'hello')
    assert.equal(created.body.transcription, '/həˈləʊ/')
    assert.equal(created.body.translation, 'привет')
    assert.equal(created.body.hasAudio, true)
    assert.equal(created.body.audioMime, 'audio/mpeg')
    assert.equal(created.body.audio, undefined)
    const id = created.body.id

    const list = await request('/vocab', 'GET', undefined, student)
    assert.equal(list.status, 200)
    assert.equal(list.body.length, 1)
    assert.equal(list.body[0].hasAudio, true)

    const one = await request('/vocab/' + id, 'GET', undefined, student)
    assert.equal(one.status, 200)
    assert.equal(one.body.transcription, '/həˈləʊ/')

    const audio = await request(
      '/vocab/' + id + '/audio',
      'GET',
      undefined,
      student,
    )
    assert.equal(audio.status, 200)
    assert.match(audio.type, /audio\/mpeg/)
    assert.deepEqual(audio.body, tinyMp3)

    const patched = await request(
      '/vocab/' + id,
      'PATCH',
      { transcription: '/həˈloʊ/', translation: 'здравствуйте' },
      teacher,
    )
    assert.equal(patched.status, 200)
    assert.equal(patched.body.transcription, '/həˈloʊ/')
    assert.equal(patched.body.hasAudio, true)

    const clearAudio = await request(
      '/vocab/' + id,
      'PATCH',
      { audio: '' },
      teacher,
    )
    assert.equal(clearAudio.status, 200)
    assert.equal(clearAudio.body.hasAudio, false)
    assert.equal(
      (await request('/vocab/' + id + '/audio', 'GET', undefined, student))
        .status,
      404,
    )

    const ttsFail = await request(
      '/vocab',
      'POST',
      { word: 'world', transcription: '/wɜːld/', tts: true },
      teacher,
    )
    assert.equal(ttsFail.status, 503)

    const removed = await request(
      '/vocab/' + id,
      'DELETE',
      undefined,
      teacher,
    )
    assert.equal(removed.status, 200)
    assert.equal(
      (await request('/vocab/' + id, 'GET', undefined, student)).status,
      404,
    )
  } finally {
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = prevKey
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})
