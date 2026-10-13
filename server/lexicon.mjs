import { createHash } from 'node:crypto'
import { staff } from './store.mjs'

// Reference lexicon imported from the textbook master table.
// Term = unique word/expression; occurrence = term in a textbook unit.

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status })
}
const clean = (value, max) =>
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, max)
    : ''
const keyOf = (value) => clean(value, 200).toLocaleLowerCase('ru')
const transcriptionOf = (value) =>
  clean(value, 200)
    .replace(/^\/+|\/+$/g, '')
    .trim()
const slug = (value) =>
  keyOf(value)
    .replace(/[^a-z0-9а-яё]+/g, '-')
    .replace(/^-+|-+$/g, '')
const termId = (key) =>
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
  `)
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
    const insertUnit = db.prepare(
      'INSERT INTO lexicon_units (id, bookId, number, theme) VALUES (?,?,?,?)',
    )
    for (const u of units.values())
      insertUnit.run(u.id, u.bookId, u.number, u.theme)
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
              u.number AS unitNumber, u.theme, u.bookId, b.title AS bookTitle, b.level
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
      transcription: row.transcription,
      unit: {
        id: row.unitId,
        number: row.unitNumber,
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

  if (path === '/api/lexicon/themes' && req.method === 'GET') {
    const rows = db
      .prepare(
        `SELECT u.theme, u.id, u.bookId, u.number
         FROM lexicon_units u JOIN lexicon_books b ON b.id = u.bookId
         ORDER BY u.theme COLLATE NOCASE, b.sortOrder, u.number`,
      )
      .all()
    const counts = new Map(
      db
        .prepare(
          `SELECT u.theme, count(DISTINCT o.termId) AS n
           FROM lexicon_occurrences o JOIN lexicon_units u ON u.id = o.unitId
           GROUP BY u.theme`,
        )
        .all()
        .map((r) => [r.theme, r.n]),
    )
    const themes = new Map()
    for (const row of rows) {
      if (!themes.has(row.theme))
        themes.set(row.theme, {
          title: row.theme,
          termCount: counts.get(row.theme) || 0,
          units: [],
        })
      themes
        .get(row.theme)
        .units.push({ id: row.id, bookId: row.bookId, number: row.number })
    }
    send(200, [...themes.values()])
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
        `SELECT o.id, o.sentence, o.transcription AS ownTranscription,
                t.id AS termId, t.term, t.translation, t.transcription
         FROM lexicon_occurrences o JOIN lexicon_terms t ON t.id = o.termId
         WHERE o.unitId = ? ORDER BY t.termKey, o.sortOrder`,
      )
      .all(unit.id)
    send(200, {
      id: unit.id,
      number: unit.number,
      theme: unit.theme,
      book: { id: unit.bookId, title: unit.bookTitle, level: unit.level },
      entries: entries.map((e) => ({
        occurrenceId: e.id,
        termId: e.termId,
        term: e.term,
        translation: e.translation,
        transcription: e.ownTranscription || e.transcription,
        sentence: e.sentence,
      })),
    })
    return true
  }

  if (path === '/api/lexicon/search' && req.method === 'GET') {
    const q = keyOf(params.get('q') || '')
    const bookId = clean(params.get('bookId'), 120)
    const unitId = clean(params.get('unitId'), 140)
    const theme = clean(params.get('theme'), 200)
    const limit = Math.min(Math.max(Number(params.get('limit')) || 50, 1), 200)
    const offset = Math.max(Number(params.get('offset')) || 0, 0)
    const where = []
    const args = []
    if (q) {
      where.push(
        "(t.termKey LIKE ? ESCAPE '\\' OR t.translationKey LIKE ? ESCAPE '\\')",
      )
      args.push(likeOf(q), likeOf(q))
    }
    if (bookId || unitId || theme) {
      const filters = []
      for (const [sql, value] of [
        ['u.bookId = ?', bookId],
        ['u.id = ?', unitId],
        ['u.theme = ?', theme],
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
