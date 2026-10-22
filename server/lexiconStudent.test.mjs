import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword } from './store.mjs'
import { readXlsx, readXlsxSheets } from './xlsx.mjs'
import { importLexicon } from './lexicon.mjs'
import { importBook } from './lexiconBook.mjs'
import { buildXlsx } from './testXlsx.mjs'

const MASTER = [
  ['Термин', 'Перевод', 'Контекстное предложение', 'Учебник', 'Уровень книги', 'Юнит', 'Тема', 'Транскрипция'],
  ['aunt', 'тётя', 'x', 'Elementary', 'A1-A2', 1, 'Люди', ''],
  ['uncle', 'дядя', 'x', 'Elementary', 'A1-A2', 1, 'Люди', ''],
  ['kitchen', 'кухня', 'x', 'Elementary', 'A1-A2', 2, 'Дом', ''],
  ['friend', 'друг', 'We used "friend" in class today.', 'Pre-Intermediate & Intermediate', 'A2-B1', 13, 'Люди', '/frend/'],
]
const HEADER = ['Тема', '№ юнита', 'Подтема', 'Категория', 'Тип', 'Слово / выражение', 'Транскрипция', 'Перевод', 'Пример', 'Перевод примера']
const ELEMENTARY = [
  HEADER,
  ['People', '1', 'The family', 'Слово', 'n', 'aunt', '[ɑːnt]', 'тётя', 'My aunt lives in London.', 'Моя тётя живёт в Лондоне.'],
  ['People', '1', 'The family', 'Слово', 'n', 'uncle', '[ˈʌŋkl]', 'дядя', 'My uncle is a doctor.', 'Мой дядя врач.'],
  ['At home', '2', 'In the kitchen', 'Слово', 'n', 'kitchen', '[ˈkɪtʃɪn]', 'кухня', 'The kitchen is small.', 'Кухня маленькая.'],
]

test('student dictionary: topics, levels, subtopic words, progress', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-student-lexicon-'))
  const { server, db } = createApp({ dbPath: join(dir, 'test.sqlite') })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const password = randomBytes(18).toString('hex'),
    hash = await hashPassword(password)
  for (const [id, roles, teacher] of [
    ['teacher', ['owner', 'teacher'], null],
    ['anna', ['student'], 'teacher'],
    ['boris', ['student'], 'teacher'],
  ])
    db.prepare(
      'INSERT INTO users (id,name,email,password,roles,teacherId) VALUES (?,?,?,?,?,?)',
    ).run(id, id, `${id}@example.test`, hash, JSON.stringify(roles), teacher)
  importLexicon(db, readXlsx(buildXlsx(MASTER)))
  importBook(
    db,
    readXlsxSheets(buildXlsx([{ name: 'Elementary', rows: ELEMENTARY }], { prefix: 'x:' })),
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
    return { status: res.status, body: await res.json() }
  }
  async function login(id) {
    const res = await fetch(base + '/login', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${id}@example.test`, password }),
    })
    return res.headers.get('set-cookie').split(';')[0]
  }
  const termId = (key) =>
    db.prepare('SELECT id FROM lexicon_terms WHERE termKey=?').get(key).id
  try {
    assert.equal((await request('/lexicon/me/topics')).status, 401)
    const teacher = await login('teacher')
    const anna = await login('anna')
    const boris = await login('boris')

    // A teacher-made subtopic with a Pre-Int word, and an empty topic.
    const people = db.prepare("SELECT id FROM vocab_topics WHERE title='People'").get()
    const manual = await request(
      `/vocab/topics/${people.id}/subtopics`,
      'POST',
      { title: 'Друзья' },
      teacher,
    )
    await request(
      `/lexicon/subtopics/${manual.body.id}/terms`,
      'POST',
      { termIds: [termId('friend')] },
      teacher,
    )
    await request('/vocab/topics', 'POST', { title: 'Пустая тема' }, teacher)

    const topics = await request('/lexicon/me/topics', 'GET', undefined, anna)
    assert.equal(topics.status, 200)
    assert.deepEqual(
      topics.body.map((t) => [t.title, t.description, t.termCount, t.subtopicCount, t.progress.percent]),
      [
        ['At home', '', 1, 1, 0],
        ['People', '', 3, 2, 0],
        ['Люди', '', 1, 0, 0],
      ],
    )
    const elementaryOnly = await request(
      '/lexicon/me/topics?bookId=elementary',
      'GET',
      undefined,
      anna,
    )
    assert.deepEqual(
      elementaryOnly.body.map((t) => [t.title, t.termCount]),
      [
        ['At home', 1],
        ['People', 3],
      ],
    )

    const detail = await request(`/lexicon/me/topics/${people.id}`, 'GET', undefined, anna)
    assert.deepEqual(
      detail.body.subtopics.map((s) => [s.title, s.level, s.termCount]),
      [
        ['1. The family', 'A1-A2', 2],
        ['Друзья', '', 1],
      ],
    )
    const preIntOnly = await request(
      `/lexicon/me/topics/${people.id}?bookId=pre-intermediate-intermediate`,
      'GET',
      undefined,
      anna,
    )
    assert.deepEqual(preIntOnly.body.subtopics.map((s) => s.title), ['Друзья'])
    assert.equal(
      (await request('/lexicon/me/topics/nope', 'GET', undefined, anna)).status,
      404,
    )

    const family = detail.body.subtopics[0]
    const words = await request(`/lexicon/me/subtopics/${family.id}`, 'GET', undefined, anna)
    assert.equal(words.body.topicTitle, 'People')
    assert.deepEqual(words.body.words[0], {
      id: termId('aunt'),
      term: 'aunt',
      translation: 'тётя',
      transcription: 'ɑːnt',
      sentence: 'My aunt lives in London.',
      sentenceTranslation: 'Моя тётя живёт в Лондоне.',
      pos: 'n',
      category: 'Слово',
      level: 'A1-A2',
      status: 'new',
    })
    const friends = await request(`/lexicon/me/subtopics/${manual.body.id}`, 'GET', undefined, anna)
    assert.equal(friends.body.words[0].sentence, '')
    assert.equal(friends.body.words[0].level, 'A2-B1')

    // Progress: validation, Mastery statuses, per-user isolation.
    for (const bad of [{}, { results: [] }, { results: [{ termId: 'nope', correct: true }] }, { results: [{ termId: termId('aunt'), correct: 'yes' }] }])
      assert.equal((await request('/lexicon/me/progress', 'POST', bad, anna)).status, 400)
    const aunt = termId('aunt')
    const saved = await request(
      '/lexicon/me/progress',
      'POST',
      {
        results: [
          { termId: aunt, correct: true, format: 'assemble' },
          { termId: aunt, correct: true, format: 'assemble' },
          { termId: aunt, correct: true, format: 'assemble' },
          { termId: termId('uncle'), correct: false, format: 'choose-translation' },
        ],
      },
      anna,
    )
    // Three answers on one day stop at the first stage (40).
    assert.deepEqual(saved.body.statuses, {
      [aunt]: 'reviewing',
      [termId('uncle')]: 'learning',
    })
    const early = await request(`/lexicon/me/topics/${people.id}`, 'GET', undefined, anna)
    // 40/90 of one word out of two.
    assert.deepEqual(early.body.subtopics[0].progress, { total: 2, mastered: 0, percent: 22 })
    db.prepare('UPDATE lexicon_progress SET mastery = 95 WHERE userId=? AND termId=?').run('anna', aunt)
    const after = await request(`/lexicon/me/topics/${people.id}`, 'GET', undefined, anna)
    // A mastered word counts in full: 1/2 in the subtopic, 1/3 in the topic.
    assert.deepEqual(after.body.subtopics[0].progress, { total: 2, mastered: 1, percent: 50 })
    assert.deepEqual(after.body.progress, { total: 3, mastered: 1, percent: 33 })
    const wordsAfter = await request(`/lexicon/me/subtopics/${family.id}`, 'GET', undefined, anna)
    assert.deepEqual(wordsAfter.body.words.map((w) => w.status), ['mastered', 'learning'])
    const borisView = await request(`/lexicon/me/topics/${people.id}`, 'GET', undefined, boris)
    assert.equal(borisView.body.progress.percent, 0)
    const row = db
      .prepare('SELECT correct, wrong FROM lexicon_progress WHERE userId=? AND termId=?')
      .get('anna', aunt)
    assert.deepEqual({ ...row }, { correct: 3, wrong: 0 })

    // Unknown words in a batch are skipped, not fatal.
    const mixed = await request(
      '/lexicon/me/progress',
      'POST',
      {
        results: [
          { termId: 'gone', correct: true, format: 'assemble' },
          { termId: termId('kitchen'), correct: true, format: 'assemble' },
        ],
      },
      anna,
    )
    assert.deepEqual(mixed.body.statuses, { [termId('kitchen')]: 'learning' })

    // Trainer sets from homework: only open work, own homework only.
    const hw = (title, termIds) =>
      request(
        '/homework',
        'POST',
        {
          studentId: 'anna',
          title,
          description: 'x',
          due: '',
          lexicon: [{ kind: 'subtopic', id: family.id, termIds }],
        },
        teacher,
      )
    const open = await hw('Семья', [termId('uncle'), aunt])
    const done = await hw('Сдано', [aunt])
    db.prepare(
      "INSERT INTO submissions (id, homeworkId, text, created, status) VALUES ('s1', ?, 'a', ?, 'accepted')",
    ).run(done.body.id, new Date().toISOString())
    const returned = await hw('На доработке', [aunt])
    db.prepare(
      "INSERT INTO submissions (id, homeworkId, text, created, status) VALUES ('s2', ?, 'a', ?, 'returned')",
    ).run(returned.body.id, new Date().toISOString())
    const sets = await request('/lexicon/me/homework', 'GET', undefined, anna)
    assert.deepEqual(
      sets.body.map((h) => [h.title, h.status, h.wordCount]),
      [
        ['На доработке', 'returned', 1],
        ['Семья', 'todo', 2],
      ],
    )
    const hwWords = await request(`/lexicon/me/homework/${open.body.id}/words`, 'GET', undefined, anna)
    assert.deepEqual(
      hwWords.body.words.map((w) => [w.term, w.translation, w.sentence, w.level, w.status]),
      [
        ['uncle', 'дядя', 'My uncle is a doctor.', 'A1-A2', 'learning'],
        ['aunt', 'тётя', 'My aunt lives in London.', 'A1-A2', 'mastered'],
      ],
    )
    assert.equal(
      (await request(`/lexicon/me/homework/${open.body.id}/words`, 'GET', undefined, boris)).status,
      404,
    )
    assert.deepEqual((await request('/lexicon/me/homework', 'GET', undefined, boris)).body, [])

    // Memory best time: personal best, place among students only.
    assert.deepEqual(
      (await request('/lexicon/me/records/memory', 'GET', undefined, anna)).body,
      { best: null, improved: false, rank: null, total: 0 },
    )
    assert.equal((await request('/lexicon/me/records/cards', 'GET', undefined, anna)).status, 404)
    assert.equal(
      (await request('/lexicon/me/records/memory', 'POST', { seconds: 0 }, anna)).status,
      400,
    )
    const first = await request('/lexicon/me/records/memory', 'POST', { seconds: 50 }, anna)
    assert.deepEqual(first.body, { best: 50, improved: true, rank: 1, total: 1 })
    const slower = await request('/lexicon/me/records/memory', 'POST', { seconds: 70 }, anna)
    assert.deepEqual(slower.body, { best: 50, improved: false, rank: 1, total: 1 })
    await request('/lexicon/me/records/memory', 'POST', { seconds: 40 }, boris)
    await request('/lexicon/me/records/memory', 'POST', { seconds: 10 }, teacher)
    const annaRank = await request('/lexicon/me/records/memory', 'GET', undefined, anna)
    assert.deepEqual(annaRank.body, { best: 50, improved: false, rank: 2, total: 2 })
    assert.equal(JSON.stringify(annaRank.body).includes('boris'), false)

    // Search results link occurrences to their unit subtopic.
    const found = await request('/lexicon/search?q=aunt', 'GET', undefined, anna)
    assert.equal(found.body.items[0].units[0].subtopicId, family.id)
    assert.equal(found.body.items[0].units[0].topicId, people.id)
  } finally {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
