import { clean } from './lexicon.mjs'
import {
  MASTERED_AT,
  initLexiconMetrics,
  parseAttempts,
  recordAttempts,
  statusOf,
} from './lexiconMetrics.mjs'

// Student view of the textbook dictionary («Мои слова → Словарь → Темы»):
// every topic is open to every signed-in user; progress is kept per user.

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status })
}
// Placeholder sentences of the original master table, not real examples.
const TEMPLATE_SENTENCE =
  /^(I heard|We practised|She wrote|The teacher explained|We used|He remembered)\b.*"/
// Import note for teachers, not a description for students.
const IMPORT_NOTE = /^Ранее: /

// Formats with a personal best time and a place among students.
const TIMED_FORMATS = new Set(['memory'])

export function initLexiconStudent(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS trainer_records (
    userId TEXT NOT NULL REFERENCES users(id),
    format TEXT NOT NULL,
    bestSec INTEGER NOT NULL,
    updated TEXT NOT NULL,
    PRIMARY KEY (userId, format)
  )`)
  initLexiconMetrics(db)
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

// Word states of a user: termId → { status, mastery }.
const statesOf = (db, userId) =>
  new Map(
    db
      .prepare('SELECT termId, mastery FROM lexicon_progress WHERE userId=?')
      .all(userId)
      .map((r) => [r.termId, { status: statusOf(r), mastery: r.mastery }]),
  )
const statusIn = (states, id) => states.get(id)?.status || 'new'

// Percent of a topic: Mastery of its words, a mastered word counts in full.
function progressOf(ids, states) {
  const total = ids.length
  let score = 0
  let mastered = 0
  for (const id of ids) {
    const state = states.get(id)
    score += Math.min(1, (state?.mastery || 0) / MASTERED_AT)
    if (state?.status === 'mastered') mastered++
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
    const statuses = statesOf(db, user.id)
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
    const statuses = statesOf(db, user.id)
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
    const statuses = statesOf(db, user.id)
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
          status: statusIn(statuses, w.id),
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

  // Trainer sets from homework: work still on the student's side
  // (no submission yet or returned for revision).
  if (path === '/api/lexicon/me/homework' && req.method === 'GET') {
    const rows = db
      .prepare(
        `SELECT h.id, h.title, h.due, h.created,
                (SELECT status FROM submissions s WHERE s.homeworkId = h.id
                 ORDER BY s.created DESC, s.rowid DESC LIMIT 1) AS status,
                (SELECT count(*) FROM homework_terms t WHERE t.homeworkId = h.id) AS wordCount
         FROM homework h WHERE h.studentId = ?
         ORDER BY h.created DESC`,
      )
      .all(user.id)
      .map((h) => ({ ...h, status: h.status || 'todo' }))
      .filter((h) => h.status === 'todo' || h.status === 'returned')
    send(200, rows)
    return true
  }

  const hwMatch = /^\/api\/lexicon\/me\/homework\/([^/]+)\/words$/.exec(path)
  if (hwMatch && req.method === 'GET') {
    const hw = db
      .prepare('SELECT id, title FROM homework WHERE id = ? AND studentId = ?')
      .get(decodeURIComponent(hwMatch[1]), user.id)
    if (!hw) fail(404, 'Задание не найдено')
    const statuses = statesOf(db, user.id)
    // The assigned snapshot wins; examples come from the dictionary.
    const words = db
      .prepare(
        `SELECT h.termId AS id, h.term, h.translation, h.transcription,
                o.sentence, o.sentenceTranslation, o.pos, o.category, b.level
         FROM homework_terms h
         LEFT JOIN lexicon_occurrences o ON o.id = (
           SELECT min(x.id) FROM lexicon_occurrences x WHERE x.termId = h.termId)
         LEFT JOIN lexicon_units u ON u.id = o.unitId
         LEFT JOIN lexicon_books b ON b.id = u.bookId
         WHERE h.homeworkId = ? ORDER BY h.sortOrder`,
      )
      .all(hw.id)
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
          status: statusIn(statuses, w.id),
        }
      })
    send(200, { ...hw, words })
    return true
  }

  // Best time and place among students; names of others are never sent.
  const recordMatch = /^\/api\/lexicon\/me\/records\/([a-z-]+)$/.exec(path)
  if (recordMatch && ['GET', 'POST'].includes(req.method)) {
    const format = recordMatch[1]
    if (!TIMED_FORMATS.has(format)) fail(404, 'Не найдено')
    let improved = false
    if (req.method === 'POST') {
      const data = await body(req, 1000)
      const seconds = data.seconds
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 86400)
        fail(400, 'Некорректное время')
      const current = db
        .prepare('SELECT bestSec FROM trainer_records WHERE userId=? AND format=?')
        .get(user.id, format)
      if (!current || seconds < current.bestSec) {
        improved = true
        db.prepare(
          `INSERT INTO trainer_records (userId, format, bestSec, updated) VALUES (?,?,?,?)
           ON CONFLICT(userId, format) DO UPDATE SET bestSec=excluded.bestSec, updated=excluded.updated`,
        ).run(user.id, format, seconds, new Date().toISOString())
      }
    }
    const students = db
      .prepare(
        `SELECT r.userId, r.bestSec FROM trainer_records r
         JOIN users u ON u.id = r.userId
         WHERE r.format = ? AND u.archived = 0 AND u.roles LIKE '%"student"%'`,
      )
      .all(format)
    const mine = students.find((r) => r.userId === user.id)
    send(200, {
      best: mine?.bestSec ?? null,
      improved,
      rank: mine ? 1 + students.filter((r) => r.bestSec < mine.bestSec).length : null,
      total: students.length,
    })
    return true
  }

  // Trainer answers: one attempt per answered exercise (lexiconMetrics.mjs).
  if (path === '/api/lexicon/me/progress' && req.method === 'POST') {
    const data = await body(req, 100000)
    const attempts = parseAttempts(data.results)
    const ids = [...new Set(attempts.map((a) => a.termId))]
    const known = new Set(
      db
        .prepare(
          `SELECT id FROM lexicon_terms WHERE id IN (${ids.map(() => '?').join(',')})`,
        )
        .all(...ids)
        .map((r) => r.id),
    )
    // Homework keeps a snapshot, so a word may be gone from the dictionary.
    if (!known.size) fail(400, 'Слова не найдены')
    send(200, { statuses: recordAttempts(db, user, attempts, known) })
    return true
  }

  fail(404, 'Не найдено')
}
