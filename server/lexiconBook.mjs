import { randomUUID } from 'node:crypto'
import {
  clean,
  keyOf,
  slug,
  systemAuthor,
  termId,
  transcriptionOf,
} from './lexicon.mjs'

// Curated per-book vocabulary file (English Vocabulary in Use): topics,
// one subtopic per unit, words with unit-specific translation and examples.
// The file becomes the source of truth for its book; re-running is safe.

const COLUMNS = {
  topic: (h) => h === 'тема',
  unit: (h) => h.startsWith('№ юнита') || h === 'юнит',
  subtopic: (h) => h === 'подтема',
  category: (h) => h === 'категория',
  pos: (h) => h === 'тип',
  term: (h) => h.startsWith('слово'),
  transcription: (h) => h.startsWith('транскрипция'),
  translation: (h) => h === 'перевод',
  sentence: (h) => h === 'пример',
  sentenceTranslation: (h) => h === 'перевод примера',
}
const REQUIRED = { topic: 'Тема', unit: '№ юнита', subtopic: 'Подтема', term: 'Слово / выражение', translation: 'Перевод' }

function parse(rows) {
  const [header, ...data] = rows
  if (!header) throw new Error('Основной лист пустой')
  const column = {}
  header.cells.forEach((cell, index) => {
    const name = keyOf(cell)
    for (const [field, match] of Object.entries(COLUMNS))
      if (column[field] === undefined && match(name)) column[field] = index
  })
  const missing = Object.keys(REQUIRED).filter((f) => column[f] === undefined)
  if (missing.length)
    throw new Error(
      `Нет колонок: ${missing.map((f) => REQUIRED[f]).join(', ')}`,
    )
  const units = new Map()
  const errors = []
  for (const row of data) {
    const get = (field, max = 1000) =>
      column[field] === undefined ? '' : clean(row.cells[column[field]], max)
    if (row.cells.every((cell) => !clean(cell, 1))) continue
    const number = Number(get('unit', 20))
    const topic = get('topic', 120)
    const subtopic = get('subtopic', 200)
    const term = get('term', 200)
    const problems = []
    if (!Number.isInteger(number) || number < 1)
      problems.push('юнит должен быть целым числом')
    if (!topic) problems.push('нет темы')
    if (!subtopic) problems.push('нет подтемы')
    if (!term) problems.push('нет слова')
    if (problems.length) {
      errors.push(`строка ${row.number}: ${problems.join(', ')}`)
      continue
    }
    let unit = units.get(number)
    if (!unit) units.set(number, (unit = { number, topic, subtopic, words: [] }))
    else if (unit.topic !== topic || unit.subtopic !== subtopic)
      errors.push(
        `строка ${row.number}: у юнита ${number} разные тема/подтема («${unit.topic} / ${unit.subtopic}» и «${topic} / ${subtopic}»)`,
      )
    unit.words.push({
      term,
      key: keyOf(term),
      translation: get('translation', 300),
      transcription: transcriptionOf(get('transcription', 200)),
      sentence: get('sentence'),
      sentenceTranslation: get('sentenceTranslation'),
      pos: get('pos', 40),
      category: get('category', 40),
    })
  }
  return { units, errors }
}

const fail = (errors) => {
  const shown = errors.slice(0, 20).join('\n')
  throw new Error(
    `Ошибки в файле (${errors.length}), база не изменена:\n${shown}${errors.length > 20 ? '\n…' : ''}`,
  )
}

/**
 * sheets: [{ name, rows }] from readXlsxSheets; the first sheet holds the
 * words and is named after the book (or pass bookId).
 */
export function importBook(db, sheets, { bookId, dryRun = false } = {}) {
  const sheet = sheets[0]
  if (!sheet) throw new Error('В файле нет листов')
  const id = bookId || slug(sheet.name)
  const book = db.prepare('SELECT * FROM lexicon_books WHERE id=?').get(id)
  if (!book) {
    const known = db
      .prepare('SELECT id FROM lexicon_books ORDER BY sortOrder')
      .all()
      .map((b) => b.id)
    throw new Error(
      `Учебник «${id}» не найден в словаре. Известные: ${known.join(', ')}. Укажите --book=<id>`,
    )
  }
  const { units, errors } = parse(sheet.rows)
  const bookUnits = new Map(
    db
      .prepare('SELECT * FROM lexicon_units WHERE bookId=?')
      .all(book.id)
      .map((u) => [u.number, u]),
  )
  for (const number of units.keys())
    if (!bookUnits.has(number))
      errors.push(`юнит ${number} отсутствует в учебнике «${book.title}»`)
  if (errors.length) fail(errors)
  if (!units.size) throw new Error('В файле нет строк со словами')

  const report = {
    book: book.title,
    level: book.level,
    topics: [],
    levelRenames: [],
    subtopics: { created: 0, updated: 0 },
    words: { rows: 0, newTerms: 0, removedOccurrences: 0, deletedTerms: 0 },
    emptyTopics: [],
  }
  const now = new Date().toISOString()
  let author
  const topicBooks = (topicIdValue) =>
    db
      .prepare('SELECT DISTINCT bookId FROM lexicon_units WHERE topicId=?')
      .all(topicIdValue)
      .map((r) => r.bookId)
  const liveTopics = () =>
    db
      .prepare(
        'SELECT id, title, description FROM vocab_topics WHERE archived=0',
      )
      .all()
  const renameTopic = (topic, title) => {
    db.prepare('UPDATE vocab_topics SET title=?, updated=? WHERE id=?').run(
      title,
      now,
      topic.id,
    )
    topic.title = title
  }

  db.exec('BEGIN IMMEDIATE')
  try {
    // 1. Topics: English names; same name in several books gets the level.
    const fileTopics = [...new Set([...units.values()].map((u) => u.topic))]
    const claimed = new Set()
    const targetOf = new Map()
    for (const name of fileTopics) {
      const key = keyOf(name)
      const isSameName = (title) =>
        keyOf(title) === key ||
        (keyOf(title).startsWith(`${key} (`) && title.endsWith(')'))
      const others = liveTopics().filter(
        (t) =>
          isSameName(t.title) && topicBooks(t.id).some((b) => b !== book.id),
      )
      const title = others.length ? `${name} (${book.level})` : name
      for (const other of others)
        if (keyOf(other.title) === key) {
          const otherBook = db
            .prepare(
              `SELECT b.level FROM lexicon_units u JOIN lexicon_books b ON b.id=u.bookId
               WHERE u.topicId=? AND u.bookId<>? ORDER BY b.sortOrder LIMIT 1`,
            )
            .get(other.id, book.id)
          const renamed = `${name} (${otherBook.level})`
          report.levelRenames.push({ from: other.title, to: renamed })
          renameTopic(other, renamed)
        }

      let target = liveTopics().find((t) => keyOf(t.title) === keyOf(title))
      let action = 'reused'
      let from = ''
      if (!target) {
        const sources = [
          ...new Set(
            [...units.values()]
              .filter((u) => u.topic === name)
              .map((u) => bookUnits.get(u.number).topicId)
              .filter(Boolean),
          ),
        ]
        const exclusive = sources
          .map((sid) => liveTopics().find((t) => t.id === sid))
          .find(
            (t) =>
              t &&
              !claimed.has(t.id) &&
              topicBooks(t.id).every((b) => b === book.id),
          )
        if (exclusive) {
          from = exclusive.title
          if (!exclusive.description && from !== title)
            db.prepare('UPDATE vocab_topics SET description=? WHERE id=?').run(
              `Ранее: ${from}`,
              exclusive.id,
            )
          renameTopic(exclusive, title)
          target = exclusive
          action = from === title ? 'reused' : 'renamed'
        } else {
          author ??= systemAuthor(db)
          target = { id: randomUUID(), title }
          db.prepare(
            `INSERT INTO vocab_topics
             (id, title, description, kind, createdBy, created, updated, archived)
             VALUES (?,?,'','main',?,?,?,0)`,
          ).run(target.id, title, author, now, now)
          action = 'created'
        }
      }
      claimed.add(target.id)
      targetOf.set(name, target)
      report.topics.push({
        title,
        action,
        from,
        units: [...units.values()].filter((u) => u.topic === name).length,
      })
    }

    // 2. Units -> target topics; theme copy follows topic titles.
    const moveUnit = db.prepare(
      'UPDATE lexicon_units SET topicId=?, title=? WHERE id=?',
    )
    for (const unit of units.values())
      moveUnit.run(
        targetOf.get(unit.topic).id,
        unit.subtopic,
        bookUnits.get(unit.number).id,
      )
    db.exec(`UPDATE lexicon_units SET theme = (
      SELECT title FROM vocab_topics t WHERE t.id = lexicon_units.topicId)
      WHERE topicId IS NOT NULL`)

    // 3. Words of the book's units are replaced by the file.
    const unitIds = [...units.keys()].map((n) => bookUnits.get(n).id)
    const marks = unitIds.map(() => '?').join(',')
    report.words.removedOccurrences = Number(
      db
        .prepare(`DELETE FROM lexicon_occurrences WHERE unitId IN (${marks})`)
        .run(...unitIds).changes,
    )
    const findTerm = db.prepare('SELECT id FROM lexicon_terms WHERE id=?')
    const insertTerm = db.prepare(
      `INSERT INTO lexicon_terms
       (id, term, termKey, translation, translationKey, transcription, updated)
       VALUES (?,?,?,?,?,?,?)`,
    )
    const updateTerm = db.prepare(
      `UPDATE lexicon_terms SET translation=?, translationKey=?, transcription=?, updated=?
       WHERE id=?`,
    )
    const insertOccurrence = db.prepare(
      `INSERT INTO lexicon_occurrences
       (termId, unitId, sentence, transcription, sortOrder, updated,
        translation, translationKey, sentenceTranslation, pos, category)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    const touched = new Set()
    let order = 0
    const unitTerms = new Map()
    for (const unit of [...units.values()].sort((a, b) => a.number - b.number)) {
      const ids = []
      for (const w of unit.words) {
        const id = termId(w.key)
        if (!findTerm.get(id)) {
          insertTerm.run(
            id,
            w.term,
            w.key,
            w.translation,
            keyOf(w.translation),
            w.transcription,
            now,
          )
          report.words.newTerms++
        } else if (!touched.has(id))
          updateTerm.run(
            w.translation,
            keyOf(w.translation),
            w.transcription,
            now,
            id,
          )
        touched.add(id)
        insertOccurrence.run(
          id,
          bookUnits.get(unit.number).id,
          w.sentence,
          w.transcription,
          order++,
          now,
          w.translation,
          keyOf(w.translation),
          w.sentenceTranslation,
          w.pos,
          w.category,
        )
        ids.push(id)
        report.words.rows++
      }
      unitTerms.set(unit.number, ids)
    }

    // 4. One subtopic per unit, «N. Title», holding the unit's words.
    const subByUnit = db.prepare(
      'SELECT id FROM vocab_subtopics WHERE lexiconUnitId=? AND archived=0',
    )
    const subsOfTopic = db.prepare(
      'SELECT id, title FROM vocab_subtopics WHERE topicId=? AND archived=0',
    )
    const updateSub = db.prepare(
      'UPDATE vocab_subtopics SET topicId=?, title=?, lexiconUnitId=?, updated=? WHERE id=?',
    )
    const insertSub = db.prepare(
      `INSERT INTO vocab_subtopics
       (id, topicId, title, description, createdBy, created, updated, archived, lexiconUnitId)
       VALUES (?,?,?,'',?,?,?,0,?)`,
    )
    const clearSubTerms = db.prepare(
      'DELETE FROM lexicon_subtopic_terms WHERE subtopicId=?',
    )
    const insertSubTerm = db.prepare(
      `INSERT OR IGNORE INTO lexicon_subtopic_terms (subtopicId, termId, sortOrder, added)
       VALUES (?,?,?,?)`,
    )
    for (const unit of units.values()) {
      const unitId = bookUnits.get(unit.number).id
      const topic = targetOf.get(unit.topic)
      const title = `${unit.number}. ${unit.subtopic}`
      let sub =
        subByUnit.get(unitId) ||
        subsOfTopic.all(topic.id).find((s) => keyOf(s.title) === keyOf(title))
      if (sub) {
        updateSub.run(topic.id, title, unitId, now, sub.id)
        report.subtopics.updated++
      } else {
        author ??= systemAuthor(db)
        sub = { id: randomUUID() }
        insertSub.run(sub.id, topic.id, title, author, now, now, unitId)
        report.subtopics.created++
      }
      clearSubTerms.run(sub.id)
      unitTerms
        .get(unit.number)
        .forEach((id, index) => insertSubTerm.run(sub.id, id, index, now))
    }

    // 5. Terms no longer used anywhere (old garbage rows) are removed.
    report.words.deletedTerms = Number(
      db
        .prepare(
          `DELETE FROM lexicon_terms WHERE
           id NOT IN (SELECT termId FROM lexicon_occurrences) AND
           id NOT IN (SELECT termId FROM lexicon_subtopic_terms)`,
        )
        .run().changes,
    )
    report.emptyTopics = db
      .prepare(
        `SELECT title FROM vocab_topics t WHERE archived=0
         AND NOT EXISTS (SELECT 1 FROM lexicon_units u WHERE u.topicId=t.id)
         AND NOT EXISTS (SELECT 1 FROM vocab_subtopics s WHERE s.topicId=t.id AND s.archived=0)
         ORDER BY title`,
      )
      .all()
      .map((t) => t.title)

    db.exec(dryRun ? 'ROLLBACK' : 'COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return report
}
