import { clean } from './lexicon.mjs'

// Student view of the textbook dictionary («Мои слова → Словарь → Темы»):
// every topic is open to every signed-in user; progress is kept per user.

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status })
}
// Share of a word counted as learned, for topic/subtopic percentages.
const WEIGHT = { new: 0, learning: 1 / 3, reviewing: 2 / 3, mastered: 1 }
// Placeholder sentences of the original master table, not real examples.
const TEMPLATE_SENTENCE =
  /^(I heard|We practised|She wrote|The teacher explained|We used|He remembered)\b.*"/
// Import note for teachers, not a description for students.
const IMPORT_NOTE = /^Ранее: /

export function initLexiconStudent(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS lexicon_progress (
    userId TEXT NOT NULL REFERENCES users(id),
    termId TEXT NOT NULL,
    status TEXT NOT NULL,
    correct INTEGER NOT NULL DEFAULT 0,
    wrong INTEGER NOT NULL DEFAULT 0,
    updated TEXT NOT NULL,
    PRIMARY KEY (userId, termId)
  )`)
}

// Same steps as the trainer: a correct answer moves the word one step up,
// a mistake sends it back to learning/reviewing.
export function nextStatus(current, correct) {
  if (!correct) return current === 'new' ? 'learning' : 'reviewing'
  if (current === 'new') return 'learning'
  if (current === 'learning') return 'reviewing'
  return 'mastered'
}

function bookFilter(params) {
  return [
    ...new Set(
      params
        .getAll('bookId')
        .flatMap((value) => value.split(','))
        .map((value) => clean(value, 120))
        .filter(Boolean),
    ),
  ].slice(0, 20)
}

const statusesOf = (db, userId) =>
  new Map(
    db
      .prepare('SELECT termId, status FROM lexicon_progress WHERE userId=?')
      .all(userId)
      .map((r) => [r.termId, r.status]),
  )

function progressOf(ids, statuses) {
  const total = ids.length
  let score = 0
  let mastered = 0
  for (const id of ids) {
    const status = statuses.get(id) || 'new'
    score += WEIGHT[status]
    if (status === 'mastered') mastered++
  }
  return {
    total,
    mastered,
    percent: total ? Math.round((score / total) * 100) : 0,
  }
}

// Subtopics of a topic visible at the chosen levels: unit subtopics of the
// selected books plus subtopics made by the teacher.
function visibleSubtopics(db, topicId, books) {
  const marks = books.map(() => '?').join(',')
  return db
    .prepare(
      `SELECT s.id, s.title, s.lexiconUnitId, b.level
       FROM vocab_subtopics s
       LEFT JOIN lexicon_units u ON u.id = s.lexiconUnitId
       LEFT JOIN lexicon_books b ON b.id = u.bookId
       WHERE s.topicId = ? AND s.archived = 0
         ${books.length ? `AND (s.lexiconUnitId IS NULL OR u.bookId IN (${marks}))` : ''}
       ORDER BY CAST(s.title AS INTEGER) = 0, CAST(s.title AS INTEGER),
                s.title COLLATE NOCASE`,
    )
    .all(topicId, ...books)
}

const subtopicTermIds = (db, subtopicId) =>
  db
    .prepare('SELECT termId FROM lexicon_subtopic_terms WHERE subtopicId=?')
    .all(subtopicId)
    .map((r) => r.termId)

function topicTermIds(db, topicId, books, subtopics) {
  const marks = books.map(() => '?').join(',')
  const ids = new Set(
    db
      .prepare(
        `SELECT DISTINCT o.termId FROM lexicon_occurrences o
         JOIN lexicon_units u ON u.id = o.unitId
         WHERE u.topicId = ? ${books.length ? `AND u.bookId IN (${marks})` : ''}`,
      )
      .all(topicId, ...books)
      .map((r) => r.termId),
  )
  for (const s of subtopics) for (const id of subtopicTermIds(db, s.id)) ids.add(id)
  return [...ids]
}

const publicTopic = (t) => ({
  id: t.id,
  title: t.title,
  description: IMPORT_NOTE.test(t.description) ? '' : t.description,
  kind: t.kind,
})

export async function lexiconStudentRoute({ path, req, db, user, body, send }) {
  if (!path.startsWith('/api/lexicon/me/')) return false
  const params = new URL(req.url, 'http://localhost').searchParams

  if (path === '/api/lexicon/me/topics' && req.method === 'GET') {
    const books = bookFilter(params)
    const statuses = statusesOf(db, user.id)
    const topics = db
      .prepare(
        `SELECT * FROM vocab_topics WHERE archived = 0
         ORDER BY kind, title COLLATE NOCASE`,
      )
      .all()
      .map((t) => {
        const subtopics = visibleSubtopics(db, t.id, books).filter(
          (s) => subtopicTermIds(db, s.id).length,
        )
        const ids = topicTermIds(db, t.id, books, subtopics)
        return {
          ...publicTopic(t),
          termCount: ids.length,
          subtopicCount: subtopics.length,
          progress: progressOf(ids, statuses),
        }
      })
      .filter((t) => t.termCount)
    send(200, topics)
    return true
  }

  const topicMatch = /^\/api\/lexicon\/me\/topics\/([^/]+)$/.exec(path)
  if (topicMatch && req.method === 'GET') {
    const topic = db
      .prepare('SELECT * FROM vocab_topics WHERE id = ? AND archived = 0')
      .get(decodeURIComponent(topicMatch[1]))
    if (!topic) fail(404, 'Тема не найдена')
    const books = bookFilter(params)
    const statuses = statusesOf(db, user.id)
    const subtopics = visibleSubtopics(db, topic.id, books)
      .map((s) => {
        const ids = subtopicTermIds(db, s.id)
        return {
          id: s.id,
          title: s.title,
          level: s.level || '',
          termCount: ids.length,
          progress: progressOf(ids, statuses),
        }
      })
      .filter((s) => s.termCount)
    const ids = topicTermIds(db, topic.id, books, subtopics)
    send(200, {
      ...publicTopic(topic),
      termCount: ids.length,
      progress: progressOf(ids, statuses),
      subtopics,
    })
    return true
  }

  const subMatch = /^\/api\/lexicon\/me\/subtopics\/([^/]+)$/.exec(path)
  if (subMatch && req.method === 'GET') {
    const sub = db
      .prepare(
        `SELECT s.id, s.title, s.topicId, t.title AS topicTitle
         FROM vocab_subtopics s JOIN vocab_topics t ON t.id = s.topicId
         WHERE s.id = ? AND s.archived = 0 AND t.archived = 0`,
      )
      .get(decodeURIComponent(subMatch[1]))
    if (!sub) fail(404, 'Подтема не найдена')
    const statuses = statusesOf(db, user.id)
    // Unit subtopics show the unit's occurrence; teacher-made ones the first.
    const words = db
      .prepare(
        `SELECT t.id, t.term,
                coalesce(nullif(o.translation, ''), t.translation) AS translation,
                coalesce(nullif(o.transcription, ''), t.transcription) AS transcription,
                o.sentence, o.sentenceTranslation, o.pos, o.category, b.level
         FROM lexicon_subtopic_terms st
         JOIN lexicon_terms t ON t.id = st.termId
         JOIN vocab_subtopics s ON s.id = st.subtopicId
         LEFT JOIN lexicon_occurrences o ON o.id = coalesce(
           (SELECT min(x.id) FROM lexicon_occurrences x
            WHERE x.termId = t.id AND x.unitId = s.lexiconUnitId),
           (SELECT min(x.id) FROM lexicon_occurrences x WHERE x.termId = t.id))
         LEFT JOIN lexicon_units u ON u.id = o.unitId
         LEFT JOIN lexicon_books b ON b.id = u.bookId
         WHERE st.subtopicId = ?
         ORDER BY st.sortOrder, t.termKey`,
      )
      .all(sub.id)
      .map((w) => {
        const template = TEMPLATE_SENTENCE.test(w.sentence || '')
        return {
          id: w.id,
          term: w.term,
          translation: w.translation,
          transcription: w.transcription,
          sentence: template ? '' : w.sentence || '',
          sentenceTranslation: template ? '' : w.sentenceTranslation || '',
          pos: w.pos || '',
          category: w.category || '',
          level: w.level || '',
          status: statuses.get(w.id) || 'new',
        }
      })
    send(200, {
      ...sub,
      words,
      progress: progressOf(
        words.map((w) => w.id),
        statuses,
      ),
    })
    return true
  }

  if (path === '/api/lexicon/me/progress' && req.method === 'POST') {
    const data = await body(req, 50000)
    const results = Array.isArray(data.results) ? data.results : []
    if (!results.length || results.length > 200)
      fail(400, 'Передайте от 1 до 200 результатов')
    for (const r of results)
      if (typeof r?.termId !== 'string' || typeof r.correct !== 'boolean')
        fail(400, 'Некорректный результат')
    const ids = [...new Set(results.map((r) => r.termId))]
    const known = new Set(
      db
        .prepare(
          `SELECT id FROM lexicon_terms WHERE id IN (${ids.map(() => '?').join(',')})`,
        )
        .all(...ids)
        .map((r) => r.id),
    )
    if (known.size !== ids.length) fail(400, 'Некоторые слова не найдены')
    const statuses = statusesOf(db, user.id)
    const now = new Date().toISOString()
    const upsert = db.prepare(
      `INSERT INTO lexicon_progress (userId, termId, status, correct, wrong, updated)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(userId, termId) DO UPDATE SET status=excluded.status,
         correct=correct+excluded.correct, wrong=wrong+excluded.wrong,
         updated=excluded.updated`,
    )
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const r of results) {
        const status = nextStatus(statuses.get(r.termId) || 'new', r.correct)
        statuses.set(r.termId, status)
        upsert.run(
          user.id,
          r.termId,
          status,
          r.correct ? 1 : 0,
          r.correct ? 0 : 1,
          now,
        )
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    send(200, {
      statuses: Object.fromEntries(ids.map((id) => [id, statuses.get(id)])),
    })
    return true
  }

  fail(404, 'Не найдено')
}
