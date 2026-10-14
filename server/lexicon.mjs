import { createHash, randomUUID } from 'node:crypto'
import { staff } from './store.mjs'

// Reference lexicon imported from the textbook master table.
// Term = unique word/expression; occurrence = term in a textbook unit.

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status })
}
export const clean = (value, max) =>
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, max)
    : ''
export const keyOf = (value) => clean(value, 200).toLocaleLowerCase('ru')
// Index transcriptions come as /…/ or […]; store them bare.
export const transcriptionOf = (value) =>
  clean(value, 200)
    .replace(/^[/[]+|[/\]]+$/g, '')
    .trim()
export const slug = (value) =>
  keyOf(value)
    .replace(/[^a-z0-9а-яё]+/g, '-')
    .replace(/^-+|-+$/g, '')
export const termId = (key) =>
  createHash('sha256').update(key).digest('hex').slice(0, 16)
const likeOf = (value) => `%${value.replace(/[\\%_]/g, '\\$&')}%`

const COLUMNS = {
  term: (h) => h === 'термин',
  translation: (h) => h === 'перевод',
  sentence: (h) => h.startsWith('контекстное предложение'),
  book: (h) => h === 'учебник',
  level: (h) => h.startsWith('уровень'),
  unit: (h) => h === 'юнит',
  theme: (h) => h === 'тема',
  transcription: (h) => h.startsWith('транскрипция'),
}
const REQUIRED = ['term', 'translation', 'book', 'unit', 'theme']
const LABELS = {
  term: 'Термин',
  translation: 'Перевод',
  book: 'Учебник',
  unit: 'Юнит',
  theme: 'Тема',
}

// Lexicon units point at vocab_topics: one "Тема" entity shared with the
// teacher's dictionary. lexicon_units.theme keeps a copy of the title for
// filtering and is synced on rename (see vocab.mjs).
// Author for topics/subtopics created by imports: owner, admin or teacher.
export function systemAuthor(db) {
  const users = db
    .prepare('SELECT id, roles FROM users WHERE archived=0 ORDER BY rowid')
    .all()
    .map((u) => ({ id: u.id, roles: JSON.parse(u.roles) }))
  for (const role of ['owner', 'admin', 'teacher']) {
    const found = users.find((u) => u.roles.includes(role))
    if (found) return found.id
  }
  throw new Error(
    'Нет преподавателя или владельца, от имени которого создать темы',
  )
}

function ensureTopics(db, titles) {
  const byKey = new Map()
  for (const t of db
    .prepare('SELECT id, title, archived FROM vocab_topics ORDER BY archived')
    .all())
    if (!byKey.has(keyOf(t.title))) byKey.set(keyOf(t.title), t)
  const result = new Map()
  let owner
  for (const title of titles) {
    const key = keyOf(title)
    const found = byKey.get(key)
    if (found) {
      if (found.archived)
        db.prepare(
          'UPDATE vocab_topics SET archived=0, updated=? WHERE id=?',
        ).run(new Date().toISOString(), found.id)
      result.set(title, found)
      continue
    }
    owner ??= systemAuthor(db)
    const now = new Date().toISOString()
    const topic = { id: randomUUID(), title, archived: 0 }
    db.prepare(
      `INSERT INTO vocab_topics
       (id, title, description, kind, createdBy, created, updated, archived)
       VALUES (?,?,'','main',?,?,?,0)`,
    ).run(topic.id, title, owner, now, now)
    byKey.set(key, topic)
    result.set(title, topic)
  }
  return result
}

export function initLexicon(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lexicon_books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT '',
      sortOrder INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS lexicon_units (
      id TEXT PRIMARY KEY,
      bookId TEXT NOT NULL REFERENCES lexicon_books(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      theme TEXT NOT NULL,
      UNIQUE (bookId, number)
    );
    CREATE TABLE IF NOT EXISTS lexicon_terms (
      id TEXT PRIMARY KEY,
      term TEXT NOT NULL,
      termKey TEXT NOT NULL UNIQUE,
      translation TEXT NOT NULL DEFAULT '',
      translationKey TEXT NOT NULL DEFAULT '',
      transcription TEXT NOT NULL DEFAULT '',
      updated TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lexicon_occurrences (
      id INTEGER PRIMARY KEY,
      termId TEXT NOT NULL REFERENCES lexicon_terms(id) ON DELETE CASCADE,
      unitId TEXT NOT NULL REFERENCES lexicon_units(id) ON DELETE CASCADE,
      sentence TEXT NOT NULL DEFAULT '',
      transcription TEXT NOT NULL DEFAULT '',
      sortOrder INTEGER NOT NULL DEFAULT 0,
      updated TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS lexicon_units_book ON lexicon_units(bookId);
    CREATE INDEX IF NOT EXISTS lexicon_occurrences_term ON lexicon_occurrences(termId);
    CREATE INDEX IF NOT EXISTS lexicon_occurrences_unit ON lexicon_occurrences(unitId);
    -- termId has no foreign key on purpose: term ids are stable hashes, so
    -- teacher-curated subtopic words survive a full re-import.
    CREATE TABLE IF NOT EXISTS lexicon_subtopic_terms (
      subtopicId TEXT NOT NULL REFERENCES vocab_subtopics(id) ON DELETE CASCADE,
      termId TEXT NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      added TEXT NOT NULL,
      PRIMARY KEY (subtopicId, termId)
    );
  `)
  const columns = db.prepare('PRAGMA table_info(lexicon_units)').all()
  if (!columns.some((c) => c.name === 'topicId'))
    db.exec(
      'ALTER TABLE lexicon_units ADD COLUMN topicId TEXT REFERENCES vocab_topics(id)',
    )
  db.exec(
    'CREATE INDEX IF NOT EXISTS lexicon_units_topic ON lexicon_units(topicId)',
  )
  // Per-unit data from curated book files (see lexiconBook.mjs).
  for (const [table, column, definition] of [
    ['lexicon_occurrences', 'translation', "TEXT NOT NULL DEFAULT ''"],
    ['lexicon_occurrences', 'translationKey', "TEXT NOT NULL DEFAULT ''"],
    ['lexicon_occurrences', 'sentenceTranslation', "TEXT NOT NULL DEFAULT ''"],
    ['lexicon_occurrences', 'pos', "TEXT NOT NULL DEFAULT ''"],
    ['lexicon_occurrences', 'category', "TEXT NOT NULL DEFAULT ''"],
    ['lexicon_units', 'title', "TEXT NOT NULL DEFAULT ''"],
    ['vocab_subtopics', 'lexiconUnitId', 'TEXT'],
  ])
    if (
      !db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .some((c) => c.name === column)
    )
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  const unlinked = db
    .prepare('SELECT DISTINCT theme FROM lexicon_units WHERE topicId IS NULL')
    .all()
    .map((r) => r.theme)
  if (!unlinked.length) return
  db.exec('BEGIN IMMEDIATE')
  try {
    const topics = ensureTopics(db, unlinked)
    const link = db.prepare(
      'UPDATE lexicon_units SET topicId=?, theme=? WHERE topicId IS NULL AND theme=?',
    )
    for (const [theme, topic] of topics) link.run(topic.id, topic.title, theme)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

// rows: [{ number, cells: string[] }], first row is the header.
export function importLexicon(db, rows, { replace = false } = {}) {
  const [header, ...data] = rows
  if (!header) throw new Error('Таблица пустая')
  const column = {}
  header.cells.forEach((cell, index) => {
    const name = keyOf(cell)
    for (const [field, match] of Object.entries(COLUMNS))
      if (column[field] === undefined && match(name)) column[field] = index
  })
  const missing = REQUIRED.filter((field) => column[field] === undefined)
  if (missing.length)
    throw new Error(
      `Нет колонок: ${missing.map((field) => LABELS[field]).join(', ')}`,
    )

  const books = new Map()
  const units = new Map()
  const terms = new Map()
  const occurrences = []
  const seen = new Set()
  const errors = []
  let duplicates = 0
  for (const row of data) {
    const get = (field, max = 1000) =>
      column[field] === undefined ? '' : clean(row.cells[column[field]], max)
    if (row.cells.every((cell) => !clean(cell, 1))) continue
    const term = get('term', 200)
    const translation = get('translation', 300)
    const bookTitle = get('book', 120)
    const level = get('level', 40)
    const number = Number(get('unit', 20))
    const theme = get('theme', 200)
    const transcription = transcriptionOf(get('transcription', 200))
    const sentence = get('sentence')
    const problems = []
    if (!term) problems.push('нет термина')
    if (!bookTitle || !slug(bookTitle)) problems.push('нет учебника')
    if (!Number.isInteger(number) || number < 1)
      problems.push('юнит должен быть целым числом')
    if (!theme) problems.push('нет темы')
    if (problems.length) {
      errors.push(`строка ${row.number}: ${problems.join(', ')}`)
      continue
    }

    const bookId = slug(bookTitle)
    const book = books.get(bookId)
    if (!book)
      books.set(bookId, {
        id: bookId,
        title: bookTitle,
        level,
        sortOrder: books.size,
      })
    else if (level && book.level && book.level !== level)
      errors.push(
        `строка ${row.number}: у учебника «${bookTitle}» разные уровни (${book.level} и ${level})`,
      )
    else if (level && !book.level) book.level = level

    const unitId = `${bookId}-${number}`
    const unit = units.get(unitId)
    if (!unit) units.set(unitId, { id: unitId, bookId, number, theme })
    else if (unit.theme !== theme)
      errors.push(
        `строка ${row.number}: у юнита ${number} («${bookTitle}») разные темы («${unit.theme}» и «${theme}»)`,
      )

    const key = keyOf(term)
    const id = termId(key)
    const existing = terms.get(key)
    if (!existing)
      terms.set(key, { id, term, termKey: key, translation, transcription })
    else {
      if (!existing.translation) existing.translation = translation
      if (!existing.transcription) existing.transcription = transcription
    }

    const unique = `${id}\n${unitId}\n${sentence}`
    if (seen.has(unique)) {
      duplicates++
      continue
    }
    seen.add(unique)
    occurrences.push({ termId: id, unitId, sentence, transcription })
  }
  if (errors.length) {
    const shown = errors.slice(0, 20).join('\n')
    throw new Error(
      `Ошибки в таблице (${errors.length}), база не изменена:\n${shown}${errors.length > 20 ? '\n…' : ''}`,
    )
  }
  if (!occurrences.length) throw new Error('В таблице нет строк со словами')

  db.exec('BEGIN IMMEDIATE')
  try {
    const count = db.prepare('SELECT count(*) AS n FROM lexicon_terms').get().n
    if (count && !replace)
      throw new Error(
        'Справочник уже заполнен. Повторный импорт заменит его целиком, включая ручные правки: запустите с --replace',
      )
    db.exec(`DELETE FROM lexicon_occurrences; DELETE FROM lexicon_terms;
      DELETE FROM lexicon_units; DELETE FROM lexicon_books;`)
    const now = new Date().toISOString()
    const insertBook = db.prepare(
      'INSERT INTO lexicon_books (id, title, level, sortOrder) VALUES (?,?,?,?)',
    )
    for (const b of books.values())
      insertBook.run(b.id, b.title, b.level, b.sortOrder)
    const topics = ensureTopics(
      db,
      [...new Set([...units.values()].map((u) => u.theme))],
    )
    const insertUnit = db.prepare(
      'INSERT INTO lexicon_units (id, bookId, number, theme, topicId) VALUES (?,?,?,?,?)',
    )
    for (const u of units.values()) {
      const topic = topics.get(u.theme)
      insertUnit.run(u.id, u.bookId, u.number, topic.title, topic.id)
    }
    const insertTerm = db.prepare(
      `INSERT INTO lexicon_terms
       (id, term, termKey, translation, translationKey, transcription, updated)
       VALUES (?,?,?,?,?,?,?)`,
    )
    for (const t of terms.values())
      insertTerm.run(
        t.id,
        t.term,
        t.termKey,
        t.translation,
        keyOf(t.translation),
        t.transcription,
        now,
      )
    const insertOccurrence = db.prepare(
      `INSERT INTO lexicon_occurrences
       (termId, unitId, sentence, transcription, sortOrder, updated)
       VALUES (?,?,?,?,?,?)`,
    )
    occurrences.forEach((o, index) =>
      insertOccurrence.run(
        o.termId,
        o.unitId,
        o.sentence,
        o.transcription,
        index,
        now,
      ),
    )
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return {
    books: books.size,
    units: units.size,
    terms: terms.size,
    occurrences: occurrences.length,
    duplicates,
    withoutTranscription: occurrences.filter((o) => !o.transcription).length,
  }
}

const TERM_ORDER = `ltrim(t.termKey, '(-./''" '), t.termKey`
// Unit-specific translation wins over the term's general one.
const OCC_TRANSLATION = "coalesce(nullif(o.translation, ''), t.translation)"

// Words of a topic: textbook units of the topic plus words of its subtopics.
export function topicTerms(db, topicId) {
  return db
    .prepare(
      `SELECT t.id, t.term, t.translation, t.transcription FROM lexicon_terms t
       WHERE t.id IN (
         SELECT o.termId FROM lexicon_occurrences o
         JOIN lexicon_units u ON u.id = o.unitId WHERE u.topicId = ?
         UNION
         SELECT st.termId FROM lexicon_subtopic_terms st
         JOIN vocab_subtopics s ON s.id = st.subtopicId
         WHERE s.topicId = ? AND s.archived = 0)
       ORDER BY ${TERM_ORDER}`,
    )
    .all(topicId, topicId)
}

// Subtopics generated from a textbook unit show that unit's translation.
export function subtopicTerms(db, subtopicId) {
  return db
    .prepare(
      `SELECT t.id, t.term,
              coalesce(nullif(o.translation, ''), t.translation) AS translation,
              coalesce(nullif(o.transcription, ''), t.transcription) AS transcription
       FROM lexicon_subtopic_terms st
       JOIN lexicon_terms t ON t.id = st.termId
       JOIN vocab_subtopics s ON s.id = st.subtopicId
       LEFT JOIN lexicon_occurrences o ON o.id = (
         SELECT min(x.id) FROM lexicon_occurrences x
         WHERE x.termId = t.id AND x.unitId = s.lexiconUnitId)
       WHERE st.subtopicId = ? ORDER BY st.sortOrder, ${TERM_ORDER}`,
    )
    .all(subtopicId)
}

const publicTerm = (row) => ({
  id: row.id,
  term: row.term,
  translation: row.translation,
  transcription: row.transcription,
})

function occurrencesOf(db, termIds) {
  if (!termIds.length) return new Map()
  const rows = db
    .prepare(
      `SELECT o.id, o.termId, o.sentence, o.transcription, o.unitId,
              o.translation, o.sentenceTranslation, o.pos, o.category,
              u.number AS unitNumber, u.theme, u.title AS unitTitle,
              u.bookId, b.title AS bookTitle, b.level
       FROM lexicon_occurrences o
       JOIN lexicon_units u ON u.id = o.unitId
       JOIN lexicon_books b ON b.id = u.bookId
       WHERE o.termId IN (${termIds.map(() => '?').join(',')})
       ORDER BY b.sortOrder, u.number, o.sortOrder`,
    )
    .all(...termIds)
  const result = new Map(termIds.map((id) => [id, []]))
  for (const row of rows)
    result.get(row.termId).push({
      id: row.id,
      sentence: row.sentence,
      sentenceTranslation: row.sentenceTranslation,
      transcription: row.transcription,
      translation: row.translation,
      pos: row.pos,
      category: row.category,
      unit: {
        id: row.unitId,
        number: row.unitNumber,
        title: row.unitTitle,
        theme: row.theme,
        bookId: row.bookId,
        bookTitle: row.bookTitle,
        level: row.level,
      },
    })
  return result
}

export async function lexiconRoute({ path, req, db, user, body, send }) {
  if (path !== '/api/lexicon' && !path.startsWith('/api/lexicon/'))
    return false
  const params = new URL(req.url, 'http://localhost').searchParams

  const topicTermsMatch = /^\/api\/lexicon\/topics\/([^/]+)\/terms$/.exec(path)
  if (topicTermsMatch && req.method === 'GET') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const topic = db
      .prepare('SELECT id, title FROM vocab_topics WHERE id = ? AND archived = 0')
      .get(decodeURIComponent(topicTermsMatch[1]))
    if (!topic) fail(404, 'Тема не найдена')
    const subtopics = db
      .prepare(
        `SELECT s.id, s.title, count(st.termId) AS termCount FROM vocab_subtopics s
         LEFT JOIN lexicon_subtopic_terms st ON st.subtopicId = s.id
         WHERE s.topicId = ? AND s.archived = 0
         GROUP BY s.id ORDER BY CAST(s.title AS INTEGER) = 0, CAST(s.title AS INTEGER), s.title COLLATE NOCASE`,
      )
      .all(topic.id)
    send(200, { ...topic, subtopics, terms: topicTerms(db, topic.id) })
    return true
  }

  const subTerms = /^\/api\/lexicon\/subtopics\/([^/]+)\/terms(?:\/([^/]+))?$/.exec(
    path,
  )
  if (subTerms) {
    if (!staff(user)) fail(403, 'Нет доступа')
    const sub = db
      .prepare(
        `SELECT s.id, s.title, s.topicId, t.title AS topicTitle FROM vocab_subtopics s
         JOIN vocab_topics t ON t.id = s.topicId
         WHERE s.id = ? AND s.archived = 0 AND t.archived = 0`,
      )
      .get(decodeURIComponent(subTerms[1]))
    if (!sub) fail(404, 'Подтема не найдена')
    const termId = subTerms[2] && decodeURIComponent(subTerms[2])
    if (!termId && req.method === 'POST') {
      const data = await body(req, 100000)
      const ids = Array.isArray(data.termIds)
        ? [...new Set(data.termIds.filter((id) => typeof id === 'string'))]
        : []
      if (!ids.length || ids.length > 500)
        fail(400, 'Отметьте от 1 до 500 слов')
      const known = new Set(
        db
          .prepare(
            `SELECT id FROM lexicon_terms WHERE id IN (${ids.map(() => '?').join(',')})`,
          )
          .all(...ids)
          .map((r) => r.id),
      )
      if (known.size !== ids.length) fail(400, 'Некоторые слова не найдены')
      const next =
        db
          .prepare(
            'SELECT coalesce(max(sortOrder), -1) + 1 AS n FROM lexicon_subtopic_terms WHERE subtopicId = ?',
          )
          .get(sub.id).n
      const insert = db.prepare(
        `INSERT OR IGNORE INTO lexicon_subtopic_terms (subtopicId, termId, sortOrder, added)
         VALUES (?,?,?,?)`,
      )
      const now = new Date().toISOString()
      let added = 0
      db.exec('BEGIN IMMEDIATE')
      try {
        ids.forEach((id, index) => {
          added += Number(insert.run(sub.id, id, next + index, now).changes)
        })
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      send(200, { ...sub, added, terms: subtopicTerms(db, sub.id) })
      return true
    }
    if (termId && req.method === 'DELETE') {
      db.prepare(
        'DELETE FROM lexicon_subtopic_terms WHERE subtopicId = ? AND termId = ?',
      ).run(sub.id, termId)
      send(200, { ...sub, terms: subtopicTerms(db, sub.id) })
      return true
    }
    if (!termId && req.method === 'GET') {
      send(200, { ...sub, terms: subtopicTerms(db, sub.id) })
      return true
    }
  }

  if (path === '/api/lexicon/books' && req.method === 'GET') {
    const units = db
      .prepare(
        `SELECT u.id, u.bookId, u.number, u.theme,
                (SELECT count(DISTINCT termId) FROM lexicon_occurrences o WHERE o.unitId = u.id) AS termCount
         FROM lexicon_units u ORDER BY u.number`,
      )
      .all()
    const books = db
      .prepare('SELECT * FROM lexicon_books ORDER BY sortOrder')
      .all()
      .map((b) => ({
        id: b.id,
        title: b.title,
        level: b.level,
        units: units
          .filter((u) => u.bookId === b.id)
          .map(({ id, number, theme, termCount }) => ({
            id,
            number,
            theme,
            termCount,
          })),
      }))
    send(200, books)
    return true
  }

  // All topics (shared with the teacher dictionary), with textbook units.
  if (path === '/api/lexicon/themes' && req.method === 'GET') {
    const units = db
      .prepare(
        `SELECT u.topicId, u.id, u.bookId, u.number
         FROM lexicon_units u JOIN lexicon_books b ON b.id = u.bookId
         ORDER BY b.sortOrder, u.number`,
      )
      .all()
    const counts = new Map(
      db
        .prepare(
          `SELECT u.topicId, count(DISTINCT o.termId) AS n
           FROM lexicon_occurrences o JOIN lexicon_units u ON u.id = o.unitId
           GROUP BY u.topicId`,
        )
        .all()
        .map((r) => [r.topicId, r.n]),
    )
    const topics = db
      .prepare(
        'SELECT id, title FROM vocab_topics WHERE archived=0 ORDER BY title COLLATE NOCASE',
      )
      .all()
    send(
      200,
      topics.map((t) => ({
        id: t.id,
        title: t.title,
        termCount: counts.get(t.id) || 0,
        units: units
          .filter((u) => u.topicId === t.id)
          .map(({ id, bookId, number }) => ({ id, bookId, number })),
      })),
    )
    return true
  }

  const unitMatch = /^\/api\/lexicon\/units\/([^/]+)$/.exec(path)
  if (unitMatch && req.method === 'GET') {
    const unit = db
      .prepare(
        `SELECT u.*, b.title AS bookTitle, b.level FROM lexicon_units u
         JOIN lexicon_books b ON b.id = u.bookId WHERE u.id = ?`,
      )
      .get(decodeURIComponent(unitMatch[1]))
    if (!unit) fail(404, 'Юнит не найден')
    const entries = db
      .prepare(
        `SELECT o.id, o.sentence, o.sentenceTranslation, o.pos, o.category,
                o.transcription AS ownTranscription,
                t.id AS termId, t.term, ${OCC_TRANSLATION} AS translation,
                t.transcription
         FROM lexicon_occurrences o JOIN lexicon_terms t ON t.id = o.termId
         WHERE o.unitId = ? ORDER BY o.sortOrder, t.termKey`,
      )
      .all(unit.id)
    send(200, {
      id: unit.id,
      number: unit.number,
      title: unit.title,
      theme: unit.theme,
      book: { id: unit.bookId, title: unit.bookTitle, level: unit.level },
      entries: entries.map((e) => ({
        occurrenceId: e.id,
        termId: e.termId,
        term: e.term,
        translation: e.translation,
        transcription: e.ownTranscription || e.transcription,
        sentence: e.sentence,
        sentenceTranslation: e.sentenceTranslation,
        pos: e.pos,
        category: e.category,
      })),
    })
    return true
  }

  // Flat occurrence rows (one per term in a unit), as in the source table.
  if (path === '/api/lexicon/entries' && req.method === 'GET') {
    const q = keyOf(params.get('q') || '')
    const limit = Math.min(Math.max(Number(params.get('limit')) || 20, 1), 200)
    const offset = Math.max(Number(params.get('offset')) || 0, 0)
    const where = []
    const args = []
    if (q) {
      where.push(
        "(t.termKey LIKE ? ESCAPE '\\' OR t.translationKey LIKE ? ESCAPE '\\' OR o.translationKey LIKE ? ESCAPE '\\')",
      )
      args.push(likeOf(q), likeOf(q), likeOf(q))
    }
    const bookIds = [
      ...new Set(
        params
          .getAll('bookId')
          .flatMap((value) => value.split(','))
          .map((value) => clean(value, 120))
          .filter(Boolean),
      ),
    ].slice(0, 50)
    if (bookIds.length) {
      where.push(`u.bookId IN (${bookIds.map(() => '?').join(',')})`)
      args.push(...bookIds)
    }
    for (const [sql, value] of [
      ['u.id = ?', clean(params.get('unitId'), 140)],
      ['u.topicId = ?', clean(params.get('topicId'), 64)],
      ['u.theme = ?', clean(params.get('theme'), 200)],
    ])
      if (value) {
        where.push(sql)
        args.push(value)
      }
    const from = `FROM lexicon_occurrences o
      JOIN lexicon_terms t ON t.id = o.termId
      JOIN lexicon_units u ON u.id = o.unitId
      JOIN lexicon_books b ON b.id = u.bookId
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`
    const total = db.prepare(`SELECT count(*) AS n ${from}`).get(...args).n
    const rank = q
      ? `CASE WHEN t.termKey = ? THEN 0 WHEN t.termKey LIKE ? ESCAPE '\\' THEN 1
              WHEN t.translationKey = ? THEN 2 ELSE 3 END,`
      : ''
    const rankArgs = q ? [q, likeOf(q).slice(1), q] : []
    const rows = db
      .prepare(
        `SELECT o.id, o.sentence, o.sentenceTranslation, o.pos, o.category,
                o.transcription AS ownTranscription,
                t.id AS termId, t.term, ${OCC_TRANSLATION} AS translation,
                t.transcription,
                u.id AS unitId, u.number AS unitNumber, u.theme,
                u.title AS unitTitle,
                b.id AS bookId, b.title AS bookTitle, b.level
         ${from}
         ORDER BY ${rank} ltrim(t.termKey, '(-./''" '), t.termKey,
                  b.sortOrder, u.number, o.sortOrder
         LIMIT ? OFFSET ?`,
      )
      .all(...args, ...rankArgs, limit, offset)
    send(200, {
      total,
      limit,
      offset,
      items: rows.map((r) => ({
        id: r.id,
        termId: r.termId,
        term: r.term,
        translation: r.translation,
        transcription: r.ownTranscription || r.transcription,
        sentence: r.sentence,
        sentenceTranslation: r.sentenceTranslation,
        pos: r.pos,
        category: r.category,
        level: r.level,
        bookId: r.bookId,
        bookTitle: r.bookTitle,
        unitId: r.unitId,
        unitNumber: r.unitNumber,
        unitTitle: r.unitTitle,
        theme: r.theme,
      })),
    })
    return true
  }

  if (path === '/api/lexicon/search' && req.method === 'GET') {
    const q = keyOf(params.get('q') || '')
    const bookId = clean(params.get('bookId'), 120)
    const unitId = clean(params.get('unitId'), 140)
    const theme = clean(params.get('theme'), 200)
    const topicId = clean(params.get('topicId'), 64)
    const limit = Math.min(Math.max(Number(params.get('limit')) || 50, 1), 200)
    const offset = Math.max(Number(params.get('offset')) || 0, 0)
    const where = []
    const args = []
    if (q) {
      where.push(
        `(t.termKey LIKE ? ESCAPE '\\' OR t.translationKey LIKE ? ESCAPE '\\'
          OR EXISTS (SELECT 1 FROM lexicon_occurrences x
            WHERE x.termId = t.id AND x.translationKey LIKE ? ESCAPE '\\'))`,
      )
      args.push(likeOf(q), likeOf(q), likeOf(q))
    }
    if (bookId || unitId || theme || topicId) {
      const filters = []
      for (const [sql, value] of [
        ['u.bookId = ?', bookId],
        ['u.id = ?', unitId],
        ['u.theme = ?', theme],
        ['u.topicId = ?', topicId],
      ])
        if (value) {
          filters.push(sql)
          args.push(value)
        }
      where.push(`EXISTS (SELECT 1 FROM lexicon_occurrences o
        JOIN lexicon_units u ON u.id = o.unitId
        WHERE o.termId = t.id AND ${filters.join(' AND ')})`)
    }
    const condition = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = db
      .prepare(`SELECT count(*) AS n FROM lexicon_terms t ${condition}`)
      .get(...args).n
    const rank = q
      ? `CASE WHEN t.termKey = ? THEN 0 WHEN t.termKey LIKE ? ESCAPE '\\' THEN 1
              WHEN t.translationKey = ? THEN 2 ELSE 3 END,`
      : ''
    const rankArgs = q ? [q, likeOf(q).slice(1), q] : []
    const rows = db
      .prepare(
        `SELECT t.* FROM lexicon_terms t ${condition}
         ORDER BY ${rank} t.termKey LIMIT ? OFFSET ?`,
      )
      .all(...args, ...rankArgs, limit, offset)
    const occurrences = occurrencesOf(
      db,
      rows.map((r) => r.id),
    )
    send(200, {
      total,
      limit,
      offset,
      items: rows.map((row) => ({
        ...publicTerm(row),
        units: occurrences.get(row.id).map((o) => o.unit),
      })),
    })
    return true
  }

  const termMatch = /^\/api\/lexicon\/terms\/([^/]+)$/.exec(path)
  if (termMatch && ['GET', 'PATCH'].includes(req.method)) {
    const id = decodeURIComponent(termMatch[1])
    const row = db.prepare('SELECT * FROM lexicon_terms WHERE id = ?').get(id)
    if (!row) fail(404, 'Слово не найдено')
    if (req.method === 'PATCH') {
      if (!staff(user)) fail(403, 'Нет доступа')
      const data = await body(req, 20000)
      const next = { ...row }
      if ('term' in data) {
        next.term = clean(data.term, 200)
        if (!next.term) fail(400, 'Укажите термин')
        next.termKey = keyOf(next.term)
        const other = db
          .prepare('SELECT id FROM lexicon_terms WHERE termKey = ? AND id <> ?')
          .get(next.termKey, id)
        if (other) fail(409, 'Такой термин уже есть в справочнике')
      }
      if ('translation' in data) {
        next.translation = clean(data.translation, 300)
        next.translationKey = keyOf(next.translation)
      }
      if ('transcription' in data)
        next.transcription = transcriptionOf(data.transcription)
      db.prepare(
        `UPDATE lexicon_terms SET term=?, termKey=?, translation=?, translationKey=?,
         transcription=?, updated=? WHERE id=?`,
      ).run(
        next.term,
        next.termKey,
        next.translation,
        next.translationKey,
        next.transcription,
        new Date().toISOString(),
        id,
      )
    }
    const fresh = db.prepare('SELECT * FROM lexicon_terms WHERE id = ?').get(id)
    send(200, {
      ...publicTerm(fresh),
      occurrences: occurrencesOf(db, [id]).get(id),
    })
    return true
  }

  const occurrenceMatch = /^\/api\/lexicon\/occurrences\/(\d+)$/.exec(path)
  if (occurrenceMatch && req.method === 'PATCH') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const id = Number(occurrenceMatch[1])
    const row = db
      .prepare('SELECT * FROM lexicon_occurrences WHERE id = ?')
      .get(id)
    if (!row) fail(404, 'Вхождение не найдено')
    const data = await body(req, 20000)
    const sentence =
      'sentence' in data ? clean(data.sentence, 1000) : row.sentence
    const transcription =
      'transcription' in data
        ? transcriptionOf(data.transcription)
        : row.transcription
    db.prepare(
      'UPDATE lexicon_occurrences SET sentence=?, transcription=?, updated=? WHERE id=?',
    ).run(sentence, transcription, new Date().toISOString(), id)
    send(200, { id, termId: row.termId, unitId: row.unitId, sentence, transcription })
    return true
  }

  fail(404, 'Не найдено')
}
