import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword } from './store.mjs'

test('vocab CRUD, catalog assignment, lesson words, audio', async () => {
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
    ['other', ['teacher'], null],
    ['student', ['student'], 'teacher'],
    ['outsider', ['student'], 'other'],
  ]) {
    db.prepare(
      'INSERT INTO users (id,name,email,password,roles,teacherId) VALUES (?,?,?,?,?,?)',
    ).run(id, id, `${id}@example.test`, hash, JSON.stringify(roles), teacher)
  }
  db.prepare(
    'INSERT INTO lessons VALUES (?,?,?,?,?,?,?,?)',
  ).run(
    'lesson-1',
    'student',
    'teacher',
    '2026-10-10',
    '10:00',
    '11:00',
    'Travelling',
    '',
  )
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
    const outsider = await login('outsider')

    assert.equal((await request('/vocab')).status, 401)

    const denied = await request(
      '/vocab',
      'POST',
      { word: 'hello', transcription: '/həˈləʊ/' },
      student,
    )
    assert.equal(denied.status, 403)

    const topic = await request(
      '/vocab/topics',
      'POST',
      {
        title: 'Путешествия и транспорт',
        description: 'Лексика для поездок',
        kind: 'main',
      },
      teacher,
    )
    assert.equal(topic.status, 201)
    const topicId = topic.body.id

    const sub = await request(
      `/vocab/topics/${topicId}/subtopics`,
      'POST',
      { title: 'Аэропорт', description: 'В терминале' },
      teacher,
    )
    assert.equal(sub.status, 201)
    const subtopicId = sub.body.id

    const tinyMp3 = Buffer.from('ID3fake-audio-bytes-for-test!!')
    const created = await request(
      '/vocab',
      'POST',
      {
        word: 'journey',
        transcription: "/ˈdʒɜːni/",
        translation: 'путешествие',
        level: 'A2',
        pos: 'Существительное',
        exampleEn: 'The journey was long.',
        exampleRu: 'Путешествие было долгим.',
        topicId,
        subtopicId,
        audio: `data:audio/mpeg;base64,${tinyMp3.toString('base64')}`,
      },
      teacher,
    )
    assert.equal(created.status, 201)
    assert.equal(created.body.word, 'journey')
    assert.equal(created.body.level, 'A2')
    assert.equal(created.body.hasAudio, true)
    const id = created.body.id

    // Without assignment student sees nothing
    const emptyList = await request('/vocab', 'GET', undefined, student)
    assert.equal(emptyList.status, 200)
    assert.equal(emptyList.body.length, 0)

    // Attach to student's lesson → visible
    const pack = await request(
      `/vocab/lessons/lesson-1/words`,
      'PUT',
      { wordIds: [id] },
      teacher,
    )
    assert.equal(pack.status, 200)

    const list = await request('/vocab', 'GET', undefined, student)
    assert.equal(list.status, 200)
    assert.equal(list.body.length, 1)
    assert.equal(list.body[0].word, 'journey')

    const one = await request('/vocab/' + id, 'GET', undefined, student)
    assert.equal(one.status, 200)
    assert.equal(one.body.transcription, "/ˈdʒɜːni/")

    assert.equal(
      (await request('/vocab/' + id, 'GET', undefined, outsider)).status,
      403,
    )

    const audio = await request(
      '/vocab/' + id + '/audio',
      'GET',
      undefined,
      student,
    )
    assert.equal(audio.status, 200)
    assert.match(audio.type, /audio\/mpeg/)
    assert.deepEqual(audio.body, tinyMp3)

    const collection = await request(
      '/vocab/collections',
      'POST',
      {
        title: 'Моё путешествие',
        description: 'Набор для поездок',
        tags: ['Путешествия'],
        wordIds: [id],
      },
      teacher,
    )
    assert.equal(collection.status, 201)

    const group = await request(
      '/vocab/groups',
      'POST',
      { title: 'Группа A2', studentIds: ['student'] },
      teacher,
    )
    assert.equal(group.status, 201)

    const assigned = await request(
      '/vocab/assignments',
      'POST',
      {
        sourceType: 'collection',
        sourceId: collection.body.id,
        targetType: 'group',
        targetIds: [group.body.id],
        exercises: ['cards', 'true-false'],
      },
      teacher,
    )
    assert.equal(assigned.status, 201)
    assert.equal(assigned.body.assignments.length, 1)

    const catalog = await request('/vocab/me/catalog', 'GET', undefined, student)
    assert.equal(catalog.status, 200)
    assert.ok(catalog.body.collections.some((c) => c.id === collection.body.id))
    assert.ok(
      catalog.body.allowedExercises[`collection:${collection.body.id}`].includes(
        'cards',
      ),
    )
    assert.equal(
      catalog.body.allowedExercises[`collection:${collection.body.id}`].includes(
        'memory',
      ),
      false,
    )

    const patched = await request(
      '/vocab/' + id,
      'PATCH',
      { transcription: '/ˈdʒɝːni/', translation: 'путь' },
      teacher,
    )
    assert.equal(patched.status, 200)
    assert.equal(patched.body.translation, 'путь')

    const clearAudio = await request(
      '/vocab/' + id,
      'PATCH',
      { audio: '' },
      teacher,
    )
    assert.equal(clearAudio.status, 200)
    assert.equal(clearAudio.body.hasAudio, false)

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
      (await request('/vocab/' + id, 'GET', undefined, teacher)).status,
      404,
    )
  } finally {
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = prevKey
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})
