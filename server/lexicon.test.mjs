import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword } from './store.mjs'
import { readXlsx } from './xlsx.mjs'
import { buildXlsx } from './testXlsx.mjs'
import { importLexicon, initLexicon } from './lexicon.mjs'

const HEADER = [
  'Термин',
  'Перевод',
  'Контекстное предложение',
  'Учебник',
  'Уровень книги',
  'Юнит',
  'Тема',
  'Транскрипция из индекса',
]
const TABLE = [
  HEADER,
  ['basket', 'корзина', 'She wrote "basket" in her notes.', 'Elementary', 'A1-A2', 3, 'Дом & еда', 'ˈbæskət'],
  ['arrive', 'приезжать', 'I heard "arrive" in a conversation.', 'Elementary', 'A1-A2', 3, 'Дом & еда', ''],
  ['basket', 'корзина', 'She wrote "basket" in her notes.', 'Elementary', 'A1-A2', 3, 'Дом & еда', 'ˈbæskət'],
  ['Basket', 'Корзина', 'We used "basket" in class today.', 'Upper-Intermediate', 'B2', 3, 'Покупки', '/ˈbɑːskɪt/'],
  ['', '', '', '', '', '', '', ''],
  ['town hall', 'ратуша', 'The teacher explained "town hall" clearly.', 'Upper-Intermediate', 'B2', 7, 'Город', '/ˌtaʊn ˈhɔːl/'],
]

test('xlsx reader and lexicon import validation', () => {
  const rows = readXlsx(buildXlsx(TABLE))
  assert.equal(rows.length, TABLE.length)
  assert.deepEqual(rows[0].cells, HEADER)
  assert.equal(rows[1].cells[6], 'Дом & еда')
  assert.equal(rows[1].cells[5], '3')
  assert.equal(rows[2].cells[7], '')
  assert.throws(() => readXlsx(Buffer.from('not a zip')), /XLSX/)

  const dir = mkdtempSync(join(tmpdir(), 'padma-lexicon-unit-'))
  const { db } = createApp({ dbPath: join(dir, 'test.sqlite') })
  try {
    db.prepare(
      'INSERT INTO users (id,name,email,password,roles) VALUES (?,?,?,?,?)',
    ).run('owner', 'owner', 'owner@example.test', 'x:00', '["owner"]')
    assert.throws(
      () => importLexicon(db, [{ number: 1, cells: ['Термин', 'Перевод'] }]),
      /Нет колонок: Учебник, Юнит, Тема/,
    )
    const broken = readXlsx(
      buildXlsx([
        HEADER,
        ['ok', 'ок', '', 'Elementary', 'A1-A2', 1, 'Тема', ''],
        ['bad', 'плохо', '', 'Elementary', 'A1-A2', 'x', 'Тема', ''],
        ['clash', 'конфликт', '', 'Elementary', 'A1-A2', 1, 'Другая', ''],
      ]),
    )
    assert.throws(
      () => importLexicon(db, broken),
      (error) =>
        /строка 3: юнит/.test(error.message) &&
        /строка 4: у юнита 1/.test(error.message),
    )
    assert.equal(db.prepare('SELECT count(*) AS n FROM lexicon_terms').get().n, 0)

    const stats = importLexicon(db, rows)
    assert.deepEqual(stats, {
      books: 2,
      units: 3,
      terms: 3,
      occurrences: 4,
      duplicates: 1,
      withoutTranscription: 1,
    })
    assert.throws(() => importLexicon(db, rows), /--replace/)
    assert.equal(importLexicon(db, rows, { replace: true }).terms, 3)
    // Themes become shared topics; re-import reuses them, matching titles
    // case-insensitively.
    const topics = db
      .prepare('SELECT id, title, kind FROM vocab_topics ORDER BY title')
      .all()
    assert.deepEqual(
      topics.map((t) => [t.title, t.kind]),
      [
        ['Город', 'main'],
        ['Дом & еда', 'main'],
        ['Покупки', 'main'],
      ],
    )
    assert.equal(
      db.prepare('SELECT count(*) AS n FROM lexicon_units WHERE topicId IS NULL').get().n,
      0,
    )
    db.prepare("UPDATE vocab_topics SET title='ГОРОД' WHERE title='Город'").run()
    importLexicon(db, rows, { replace: true })
    assert.equal(db.prepare('SELECT count(*) AS n FROM vocab_topics').get().n, 3)
    assert.equal(
      db.prepare("SELECT theme FROM lexicon_units WHERE id='upper-intermediate-7'").get().theme,
      'ГОРОД',
    )

    // Units imported before topics existed get linked on startup.
    db.exec(`UPDATE lexicon_units SET topicId=NULL, theme='Новая тема' WHERE number=7;
      DELETE FROM vocab_topics WHERE title='ГОРОД'`)
    initLexicon(db)
    const linked = db
      .prepare(
        `SELECT t.title FROM lexicon_units u JOIN vocab_topics t ON t.id=u.topicId
         WHERE u.id='upper-intermediate-7'`,
      )
      .get()
    assert.equal(linked.title, 'Новая тема')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('lexicon API: browse, search, term card, staff-only edits', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-lexicon-'))
  const { server, db } = createApp({ dbPath: join(dir, 'test.sqlite') })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const password = randomBytes(18).toString('hex'),
    hash = await hashPassword(password)
  for (const [id, roles] of [
    ['teacher', ['teacher']],
    ['student', ['student']],
  ])
    db.prepare(
      'INSERT INTO users (id,name,email,password,roles) VALUES (?,?,?,?,?)',
    ).run(id, id, `${id}@example.test`, hash, JSON.stringify(roles))
  importLexicon(db, readXlsx(buildXlsx(TABLE)))

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
      headers: {
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: `${id}@example.test`, password }),
    })
    assert.equal(res.status, 200)
    return res.headers.get('set-cookie').split(';')[0]
  }
  try {
    assert.equal((await request('/lexicon/books')).status, 401)
    const teacher = await login('teacher')
    const student = await login('student')

    const books = await request('/lexicon/books', 'GET', undefined, student)
    assert.equal(books.status, 200)
    assert.deepEqual(
      books.body.map((b) => [b.id, b.title, b.level, b.units.length]),
      [
        ['elementary', 'Elementary', 'A1-A2', 1],
        ['upper-intermediate', 'Upper-Intermediate', 'B2', 2],
      ],
    )
    assert.deepEqual(books.body[0].units[0], {
      id: 'elementary-3',
      number: 3,
      theme: 'Дом & еда',
      termCount: 2,
    })

    const themes = await request('/lexicon/themes', 'GET', undefined, student)
    assert.deepEqual(
      themes.body.map((t) => [t.title, t.termCount]),
      [
        ['Город', 1],
        ['Дом & еда', 2],
        ['Покупки', 1],
      ],
    )

    const unit = await request(
      '/lexicon/units/upper-intermediate-3',
      'GET',
      undefined,
      student,
    )
    assert.equal(unit.status, 200)
    assert.equal(unit.body.book.level, 'B2')
    assert.deepEqual(
      unit.body.entries.map((e) => [e.term, e.transcription, e.sentence]),
      [['basket', 'ˈbɑːskɪt', 'We used "basket" in class today.']],
    )
    assert.equal(
      (await request('/lexicon/units/nope-1', 'GET', undefined, student)).status,
      404,
    )

    const byWord = await request('/lexicon/search?q=BASK', 'GET', undefined, student)
    assert.equal(byWord.body.total, 1)
    assert.equal(byWord.body.items[0].transcription, 'ˈbæskət')
    assert.deepEqual(
      byWord.body.items[0].units.map((u) => u.id),
      ['elementary-3', 'upper-intermediate-3'],
    )
    const byTranslation = await request(
      `/lexicon/search?q=${encodeURIComponent('РАТУ')}`,
      'GET',
      undefined,
      student,
    )
    assert.deepEqual(byTranslation.body.items.map((i) => i.term), ['town hall'])
    const byTheme = await request(
      `/lexicon/search?theme=${encodeURIComponent('Дом & еда')}`,
      'GET',
      undefined,
      student,
    )
    assert.deepEqual(byTheme.body.items.map((i) => i.term), ['arrive', 'basket'])
    const byBook = await request(
      '/lexicon/search?bookId=upper-intermediate&limit=1&offset=1',
      'GET',
      undefined,
      student,
    )
    assert.equal(byBook.body.total, 2)
    assert.deepEqual(byBook.body.items.map((i) => i.term), ['town hall'])
    assert.equal(
      (await request('/lexicon/search?q=%25', 'GET', undefined, student)).body
        .total,
      0,
    )

    const entries = await request(
      '/lexicon/entries?q=bask',
      'GET',
      undefined,
      student,
    )
    assert.equal(entries.body.total, 2)
    assert.deepEqual(
      entries.body.items.map((e) => [
        e.term,
        e.level,
        e.unitNumber,
        e.theme,
        e.transcription,
      ]),
      [
        ['basket', 'A1-A2', 3, 'Дом & еда', 'ˈbæskət'],
        ['basket', 'B2', 3, 'Покупки', 'ˈbɑːskɪt'],
      ],
    )
    const entryPage = await request(
      `/lexicon/entries?theme=${encodeURIComponent('Дом & еда')}&limit=1&offset=1`,
      'GET',
      undefined,
      student,
    )
    assert.equal(entryPage.body.total, 2)
    assert.deepEqual(entryPage.body.items.map((e) => e.term), ['basket'])
    const entriesByBook = await request(
      `/lexicon/entries?bookId=elementary&q=${encodeURIComponent('приезж')}`,
      'GET',
      undefined,
      student,
    )
    assert.deepEqual(entriesByBook.body.items.map((e) => e.term), ['arrive'])
    const severalBooks = await request(
      '/lexicon/entries?bookId=elementary&bookId=upper-intermediate&q=bask',
      'GET',
      undefined,
      student,
    )
    assert.equal(severalBooks.body.total, 2)
    assert.deepEqual(
      severalBooks.body.items.map((e) => e.bookTitle),
      ['Elementary', 'Upper-Intermediate'],
    )

    const termId = byWord.body.items[0].id
    const card = await request(`/lexicon/terms/${termId}`, 'GET', undefined, student)
    assert.equal(card.body.occurrences.length, 2)
    const occurrenceId = card.body.occurrences[1].id

    assert.equal(
      (
        await request(
          `/lexicon/terms/${termId}`,
          'PATCH',
          { translation: 'взлом' },
          student,
        )
      ).status,
      403,
    )
    assert.equal(
      (
        await request(
          `/lexicon/occurrences/${occurrenceId}`,
          'PATCH',
          { sentence: 'взлом' },
          student,
        )
      ).status,
      403,
    )
    assert.equal(
      (
        await request(
          `/lexicon/terms/${termId}`,
          'PATCH',
          { term: 'Town Hall' },
          teacher,
        )
      ).status,
      409,
    )
    const edited = await request(
      `/lexicon/terms/${termId}`,
      'PATCH',
      { translation: 'корзинка', transcription: '/ˈbɑːskɪt/' },
      teacher,
    )
    assert.equal(edited.status, 200)
    assert.equal(edited.body.translation, 'корзинка')
    assert.equal(edited.body.transcription, 'ˈbɑːskɪt')
    assert.equal(edited.body.term, 'basket')
    const sentence = await request(
      `/lexicon/occurrences/${occurrenceId}`,
      'PATCH',
      { sentence: 'Put the apples in the basket.' },
      teacher,
    )
    assert.equal(sentence.status, 200)
    assert.equal(sentence.body.transcription, 'ˈbɑːskɪt')
    const found = await request(
      `/lexicon/search?q=${encodeURIComponent('корзинка')}`,
      'GET',
      undefined,
      student,
    )
    assert.equal(found.body.total, 1)
    const after = await request(`/lexicon/terms/${termId}`, 'GET', undefined, student)
    assert.equal(after.body.occurrences[1].sentence, 'Put the apples in the basket.')

    // Topics page: one shared entity with duplicate checks.
    const topicList = await request('/vocab/topics', 'GET', undefined, teacher)
    const home = topicList.body.find((t) => t.title === 'Дом & еда')
    assert.equal(home.lexiconWordCount, 2)
    assert.equal(
      (await request('/vocab/topics', 'POST', { title: '  дом &   ЕДА ' }, teacher))
        .status,
      409,
    )
    const created = await request(
      '/vocab/topics',
      'POST',
      { title: 'Погода', kind: 'main' },
      teacher,
    )
    assert.equal(created.status, 201)
    assert.equal(
      (await request('/vocab/topics', 'POST', { title: 'ПОГОДА', kind: 'lexical' }, teacher))
        .status,
      409,
    )
    assert.equal(
      (await request(`/vocab/topics/${created.body.id}`, 'PATCH', { title: 'Город' }, teacher))
        .status,
      409,
    )
    const themesNow = await request('/lexicon/themes', 'GET', undefined, student)
    assert.deepEqual(
      themesNow.body.find((t) => t.id === created.body.id),
      { id: created.body.id, title: 'Погода', termCount: 0, units: [] },
    )

    const renamed = await request(
      `/vocab/topics/${home.id}`,
      'PATCH',
      { title: 'Дом и еда' },
      teacher,
    )
    assert.equal(renamed.status, 200)
    const byRenamed = await request(
      `/lexicon/entries?topicId=${home.id}`,
      'GET',
      undefined,
      student,
    )
    assert.deepEqual(
      [...new Set(byRenamed.body.items.map((e) => e.theme))],
      ['Дом и еда'],
    )
    assert.equal(byRenamed.body.total, 2)
    assert.equal(
      (await request(`/vocab/topics/${home.id}`, 'DELETE', undefined, teacher))
        .status,
      409,
    )
    assert.equal(
      (await request(`/vocab/topics/${created.body.id}`, 'DELETE', undefined, teacher))
        .status,
      200,
    )

    const sub = await request(
      `/vocab/topics/${home.id}/subtopics`,
      'POST',
      { title: 'Кухня' },
      teacher,
    )
    assert.equal(sub.status, 201)
    assert.equal(
      (await request(`/vocab/topics/${home.id}/subtopics`, 'POST', { title: 'КУХНЯ' }, teacher))
        .status,
      409,
    )
    const otherTopic = topicList.body.find((t) => t.title === 'Покупки')
    assert.equal(
      (await request(`/vocab/topics/${otherTopic.id}/subtopics`, 'POST', { title: 'Кухня' }, teacher))
        .status,
      201,
    )
    const second = await request(
      `/vocab/topics/${home.id}/subtopics`,
      'POST',
      { title: 'Спальня' },
      teacher,
    )
    assert.equal(
      (await request(`/vocab/subtopics/${second.body.id}`, 'PATCH', { title: 'кухня' }, teacher))
        .status,
      409,
    )
    const detail = await request(`/vocab/topics/${home.id}`, 'GET', undefined, teacher)
    assert.equal(detail.body.lexiconWordCount, 2)
    assert.deepEqual(
      detail.body.subtopics.map((s) => s.title),
      ['Кухня', 'Спальня'],
    )

    // Subtopic words picked by the teacher from the dictionary.
    const ids = Object.fromEntries(
      (await request('/lexicon/search?limit=10', 'GET', undefined, teacher)).body.items.map(
        (i) => [i.term, i.id],
      ),
    )
    const kitchen = `/lexicon/subtopics/${sub.body.id}/terms`
    assert.equal(
      (await request(kitchen, 'POST', { termIds: [ids.basket] }, student)).status,
      403,
    )
    assert.equal((await request(kitchen, 'GET', undefined, student)).status, 403)
    const addKitchen = await request(kitchen, 'POST', { termIds: [ids.basket] }, teacher)
    assert.equal(addKitchen.body.added, 1)
    assert.equal(
      (await request(kitchen, 'POST', { termIds: [ids.basket] }, teacher)).body.added,
      0,
    )
    assert.equal(
      (await request(kitchen, 'POST', { termIds: ['nope'] }, teacher)).status,
      400,
    )
    await request(
      `/lexicon/subtopics/${second.body.id}/terms`,
      'POST',
      { termIds: [ids['town hall']] },
      teacher,
    )
    const homeTerms = await request(
      `/lexicon/topics/${home.id}/terms`,
      'GET',
      undefined,
      teacher,
    )
    assert.deepEqual(
      homeTerms.body.terms.map((t) => t.term),
      ['arrive', 'basket', 'town hall'],
    )
    assert.deepEqual(
      homeTerms.body.subtopics.map((s) => [s.title, s.termCount]),
      [
        ['Кухня', 1],
        ['Спальня', 1],
      ],
    )
    assert.equal(
      (await request(`/vocab/topics/${home.id}`, 'GET', undefined, teacher)).body
        .subtopics[0].lexiconWordCount,
      1,
    )

    // Homework with vocabulary from several sources, de-duplicated.
    db.prepare("UPDATE users SET teacherId='teacher' WHERE id='student'").run()
    const homework = (lexicon) =>
      request(
        '/homework',
        'POST',
        { studentId: 'student', title: 'Words', description: 'Learn', due: '', lexicon },
        teacher,
      )
    const hwCount = () => db.prepare('SELECT count(*) AS n FROM homework').get().n
    for (const bad of [
      [{ kind: 'collection', id: 'x', termIds: [ids.basket] }],
      [{ kind: 'topic', id: otherTopic.id, termIds: [ids.arrive] }],
      [{ kind: 'subtopic', id: sub.body.id, termIds: [ids['town hall']] }],
      [{ kind: 'search', termIds: ['nope'] }],
    ])
      assert.equal((await homework(bad)).status, 400)
    assert.equal(hwCount(), 0)
    const hw = await homework([
      { kind: 'subtopic', id: sub.body.id, termIds: [ids.basket] },
      { kind: 'topic', id: home.id, termIds: [ids.arrive, ids.basket] },
      { kind: 'search', termIds: [ids['town hall'], ids.basket] },
      { kind: 'search', termIds: [ids.arrive] },
    ])
    assert.equal(hw.status, 201)
    assert.equal(hw.body.duplicatesSkipped, 3)
    assert.deepEqual(
      hw.body.lexicon.sources.map((s) => [s.kind, s.title, s.parentTitle, s.count]),
      [
        ['subtopic', 'Кухня', 'Дом и еда', 1],
        ['topic', 'Дом и еда', '', 1],
        ['search', 'Поиск по словарю', '', 1],
      ],
    )
    assert.deepEqual(
      hw.body.lexicon.words.map((w) => [w.term, w.translation]),
      [
        ['basket', 'корзинка'],
        ['arrive', 'приезжать'],
        ['town hall', 'ратуша'],
      ],
    )
    assert.equal((await homework(undefined)).body.lexicon.words.length, 0)

    // Snapshot survives dictionary edits; the student sees the words.
    await request(`/lexicon/terms/${ids.basket}`, 'PATCH', { translation: 'лукошко' }, teacher)
    const studentHw = await request('/homework', 'GET', undefined, student)
    const seen = studentHw.body.find((h) => h.id === hw.body.id)
    assert.deepEqual(
      seen.lexicon.words.map((w) => w.translation),
      ['корзинка', 'приезжать', 'ратуша'],
    )

    const removed = await request(`${kitchen}/${ids.basket}`, 'DELETE', undefined, teacher)
    assert.deepEqual(removed.body.terms, [])
  } finally {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
