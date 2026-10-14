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
  ['aunt', 'ТЁТЯ', 'We used "aunt" in class today.', 'Elementary', 'A1-A2', 1, 'Люди и общение', '/ɑːnt/'],
  ['get married get', 'жениться', 'x', 'Elementary', 'A1-A2', 2, 'Люди и общение', ''],
  ['hello', 'привет', 'x', 'Elementary', 'A1-A2', 10, 'Люди и общение', ''],
  ['kitchen', 'кухня', 'x', 'Elementary', 'A1-A2', 3, 'Дом', ''],
  ['friend', 'друг', 'x', 'Pre-Intermediate & Intermediate', 'A2-B1', 13, 'Люди и отношения', ''],
  ['friend', 'друг', 'x', 'Advanced', 'C1-C2', 5, 'Люди и отношения', ''],
]
const BOOK_HEADER = ['Тема', '№ юнита', 'Подтема', 'Категория', 'Тип', 'Слово / выражение', 'Транскрипция', 'Перевод', 'Пример', 'Перевод примера']
const ELEMENTARY = [
  BOOK_HEADER,
  ['People', '1', 'The family', 'Слово', 'n', 'aunt', '[ɑːnt]', 'тётя', 'My aunt lives in London.', 'Моя тётя живёт в Лондоне.'],
  ['People', '1', 'The family', 'Слово', 'n', 'uncle', '[ˈʌŋkl]', 'дядя', 'My uncle is a doctor.', 'Мой дядя врач.'],
  ['People', '2', 'Birth, marriage and death', 'Слово', 'v', 'get married', '[ɡet ˈmærid]', 'жениться, выйти замуж', 'They got married in May.', 'Они поженились в мае.'],
  ['People', '10', 'Conversations', 'Выражение', 'phrase', 'hello', '[həˈləʊ]', 'привет', 'Hello, Anna!', 'Привет, Анна!'],
  ['At home', '3', 'In the kitchen', 'Слово', 'n', 'kitchen', '[ˈkɪtʃɪn]', 'кухня', 'The kitchen is small.', 'Кухня маленькая.'],
]
const PRE_INT = [
  BOOK_HEADER,
  ['People', '13', 'Family and friends', 'Слово', 'n', 'friend', '[frend]', 'друг, подруга', 'She is my best friend.', 'Она моя лучшая подруга.'],
]
const file = (name, rows) =>
  readXlsxSheets(
    buildXlsx(
      [
        { name, rows },
        { name: 'Навигация', rows: [['№ юнита', 'Тема']] },
      ],
      { prefix: 'x:' },
    ),
  )

test('book file: English topics, unit subtopics, per-unit words', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-book-'))
  const { server, db } = createApp({ dbPath: join(dir, 'test.sqlite') })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const password = randomBytes(18).toString('hex'),
    hash = await hashPassword(password)
  for (const [id, roles, teacher] of [
    ['teacher', ['owner', 'teacher'], null],
    ['student', ['student'], 'teacher'],
  ])
    db.prepare(
      'INSERT INTO users (id,name,email,password,roles,teacherId) VALUES (?,?,?,?,?,?)',
    ).run(id, id, `${id}@example.test`, hash, JSON.stringify(roles), teacher)
  importLexicon(db, readXlsx(buildXlsx(MASTER)))

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
  const loginRes = await fetch(base + '/login', {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'teacher@example.test', password }),
  })
  const teacher = loginRes.headers.get('set-cookie').split(';')[0]
  const topicByTitle = (title) =>
    db.prepare('SELECT * FROM vocab_topics WHERE title=? AND archived=0').get(title)
  const termIdOf = (key) =>
    db.prepare('SELECT id FROM lexicon_terms WHERE termKey=?').get(key)?.id
  try {
    // A teacher-made subtopic and a homework assigned before the import.
    const people = topicByTitle('Люди и общение')
    const family = await request(
      `/vocab/topics/${people.id}/subtopics`,
      'POST',
      { title: 'Семья' },
      teacher,
    )
    await request(
      `/lexicon/subtopics/${family.body.id}/terms`,
      'POST',
      { termIds: [termIdOf('aunt')] },
      teacher,
    )
    const hw = await request(
      '/homework',
      'POST',
      {
        studentId: 'student',
        title: 'Words',
        description: 'Learn',
        due: '',
        lexicon: [{ kind: 'search', termIds: [termIdOf('get married get')] }],
      },
      teacher,
    )
    assert.equal(hw.status, 201)

    // Validation: nothing changes on errors or in dry-run mode.
    const before = db.prepare('SELECT count(*) AS n FROM lexicon_occurrences').get().n
    assert.throws(() => importBook(db, file('Unknown', ELEMENTARY)), /не найден/)
    assert.throws(
      () =>
        importBook(
          db,
          file('Elementary', [...ELEMENTARY, ['People', '99', 'X', '', '', 'y', '', 'у', '', '']]),
        ),
      /юнит 99 отсутствует/,
    )
    assert.throws(
      () => importBook(db, file('Elementary', [['Тема', 'Слово']])),
      /Нет колонок/,
    )
    const dry = importBook(db, file('Elementary', ELEMENTARY), { dryRun: true })
    assert.equal(dry.subtopics.created, 4)
    assert.ok(topicByTitle('Люди и общение'))
    assert.equal(
      db.prepare('SELECT count(*) AS n FROM lexicon_occurrences').get().n,
      before,
    )

    // Elementary: exclusive topics renamed in place, subtopic per unit.
    const elem = importBook(db, file('Elementary', ELEMENTARY))
    assert.deepEqual(
      elem.topics.map((t) => [t.title, t.action, t.from]),
      [
        ['People', 'renamed', 'Люди и общение'],
        ['At home', 'renamed', 'Дом'],
      ],
    )
    assert.equal(elem.words.newTerms, 2)
    assert.equal(elem.words.deletedTerms, 1)
    const peopleNow = topicByTitle('People')
    assert.equal(peopleNow.id, people.id)
    assert.equal(peopleNow.description, 'Ранее: Люди и общение')
    assert.equal(termIdOf('get married get'), undefined)

    const detail = await request(`/vocab/topics/${people.id}`, 'GET', undefined, teacher)
    assert.deepEqual(
      detail.body.subtopics.map((s) => [s.title, s.lexiconWordCount]),
      [
        ['1. The family', 2],
        ['2. Birth, marriage and death', 1],
        ['10. Conversations', 1],
        ['Семья', 1],
      ],
    )
    const unitSub = detail.body.subtopics[0]
    const subWords = await request(
      `/lexicon/subtopics/${unitSub.id}/terms`,
      'GET',
      undefined,
      teacher,
    )
    assert.deepEqual(
      subWords.body.terms.map((t) => [t.term, t.translation, t.transcription]),
      [
        ['aunt', 'тётя', 'ɑːnt'],
        ['uncle', 'дядя', 'ˈʌŋkl'],
      ],
    )
    const unit = await request('/lexicon/units/elementary-1', 'GET', undefined, teacher)
    assert.equal(unit.body.title, 'The family')
    assert.equal(unit.body.theme, 'People')
    assert.deepEqual(unit.body.entries[0], {
      occurrenceId: unit.body.entries[0].occurrenceId,
      termId: termIdOf('aunt'),
      term: 'aunt',
      translation: 'тётя',
      transcription: 'ɑːnt',
      sentence: 'My aunt lives in London.',
      sentenceTranslation: 'Моя тётя живёт в Лондоне.',
      pos: 'n',
      category: 'Слово',
    })
    const byUnitTranslation = await request(
      `/lexicon/entries?q=${encodeURIComponent('выйти замуж')}`,
      'GET',
      undefined,
      teacher,
    )
    assert.deepEqual(byUnitTranslation.body.items.map((i) => i.term), ['get married'])

    // Assigned homework keeps its snapshot of the removed garbage term.
    const hwNow = await request('/homework', 'GET', undefined, teacher)
    assert.deepEqual(
      hwNow.body[0].lexicon.words.map((w) => w.term),
      ['get married get'],
    )

    // Pre-Int: shared topic is not renamed (Advanced keeps it); same English
    // name in two books gets the level on both.
    const pre = importBook(db, file('Pre-Intermediate & Intermediate', PRE_INT))
    assert.deepEqual(
      pre.topics.map((t) => [t.title, t.action]),
      [['People (A2-B1)', 'created']],
    )
    assert.deepEqual(pre.levelRenames, [{ from: 'People', to: 'People (A1-A2)' }])
    assert.equal(topicByTitle('People (A1-A2)').id, people.id)
    const shared = topicByTitle('Люди и отношения')
    assert.deepEqual(
      db.prepare('SELECT id FROM lexicon_units WHERE topicId=?').all(shared.id).map((u) => u.id),
      ['advanced-5'],
    )
    assert.equal(
      db.prepare("SELECT theme FROM lexicon_units WHERE id='elementary-1'").get().theme,
      'People (A1-A2)',
    )

    // Re-running changes nothing structurally.
    const subIds = () =>
      db.prepare('SELECT id FROM vocab_subtopics ORDER BY id').all().map((s) => s.id).join()
    const snapshot = subIds()
    const again = importBook(db, file('Elementary', ELEMENTARY))
    assert.equal(again.subtopics.created, 0)
    assert.equal(again.words.newTerms, 0)
    assert.deepEqual(
      again.topics.map((t) => [t.title, t.action]),
      [
        ['People (A1-A2)', 'reused'],
        ['At home', 'reused'],
      ],
    )
    assert.equal(subIds(), snapshot)
    assert.equal(
      db.prepare('SELECT count(*) AS n FROM vocab_topics WHERE archived=0').get().n,
      4,
    )
  } finally {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
