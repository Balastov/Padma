import { randomUUID } from 'node:crypto'
import { staff, privileged } from './store.mjs'
import { DEFAULT_TIME_ZONE, addDays, localDay } from './timezone.mjs'

// Word progress («Мои слова → Прогресс», «Лексика → Прогресс»).
// Two data sets feed every metric: the current state of each word
// (lexicon_progress, Mastery 0–100) and the log of attempts
// (lexicon_attempts: one row per answered exercise).

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status })
}

// Trainer formats: the skill shown in «Успешность по типам упражнений» and
// the Mastery gain of a correct answer. Gain 0 — activity only.
export const FORMATS = {
  'choose-translation': { skill: 'comprehension', gain: 15 },
  'true-false': { skill: 'comprehension', gain: 15 },
  'match-pairs': { skill: 'comprehension', gain: 15 },
  'training-cards': { skill: 'recall', gain: 25 },
  'choose-translation-audio': { skill: 'listening', gain: 25 },
  'assemble-audio': { skill: 'listening', gain: 25 },
  assemble: { skill: 'writing', gain: 25 },
  'find-word': { skill: 'writing', gain: 15 },
  cards: { skill: null, gain: 0 },
  memory: { skill: null, gain: 0 },
  // Clients from before the attempt log send no format.
  unknown: { skill: null, gain: 15 },
}
export const SKILLS = ['comprehension', 'recall', 'listening', 'writing']
const SOURCE_TYPES = new Set(['homework', 'collection', 'topic', 'lesson', 'revisit', 'all'])
export const PERIODS = [7, 28, 90]

// Mastery thresholds: Изучается < 40 ≤ Закрепляется < 90 ≤ Освоено.
export const REVIEWING_AT = 40
export const MASTERED_AT = 90
// Repeats on the same day give less and less.
const SAME_DAY_FACTOR = 0.5
// A correct answer after a break is worth more, up to ×1.5 after two weeks.
const SPACING_BONUS_DAYS = 28
const SPACING_MAX_DAYS = 14
const HINT_FACTOR = 0.5
// Mastery is capped by the number of days the word was confirmed
// independently; a day counts after a growing pause since the previous one.
// Stage 0: no independent correct answer yet.
const STAGE_CAP = [30, 40, 70, 89, 100]
const STAGE_GAP_DAYS = [0, 0, 1, 2, 4]
// A mistake takes a share of Mastery, at least a few points.
const WRONG_SHARE = 0.15
const WRONG_MIN = 5
// Success per skill: last answers of each word, newer ones weigh more.
const WINDOW = [1, 0.9, 0.8, 0.7, 0.6]
const MIN_ATTEMPTS = 5
const LOW_SAMPLE_WORDS = 5
const LOW_SAMPLE_ATTEMPTS = 20

export function initLexiconMetrics(db) {
  const columns = db.prepare('PRAGMA table_info(lexicon_progress)').all()
  // The step-status table of the first trainer is replaced; progress
  // starts from zero with the attempt log.
  if (columns.length && !columns.some((c) => c.name === 'mastery'))
    db.exec('DROP TABLE lexicon_progress')
  db.exec(`CREATE TABLE IF NOT EXISTS lexicon_progress (
    userId TEXT NOT NULL REFERENCES users(id),
    termId TEXT NOT NULL,
    status TEXT NOT NULL,
    mastery REAL NOT NULL DEFAULT 0,
    stage INTEGER NOT NULL DEFAULT 0,
    confirmDay TEXT NOT NULL DEFAULT '',
    lastCorrectDay TEXT NOT NULL DEFAULT '',
    countDay TEXT NOT NULL DEFAULT '',
    countCorrect INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    wrong INTEGER NOT NULL DEFAULT 0,
    firstDay TEXT NOT NULL,
    lastDay TEXT NOT NULL,
    updated TEXT NOT NULL,
    PRIMARY KEY (userId, termId)
  )`)
  db.exec(`CREATE TABLE IF NOT EXISTS lexicon_attempts (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id),
    termId TEXT NOT NULL,
    format TEXT NOT NULL,
    skill TEXT,
    correct INTEGER NOT NULL,
    skipped INTEGER NOT NULL DEFAULT 0,
    hinted INTEGER NOT NULL DEFAULT 0,
    sourceType TEXT NOT NULL DEFAULT '',
    sourceId TEXT NOT NULL DEFAULT '',
    sourceLabel TEXT NOT NULL DEFAULT '',
    sessionId TEXT NOT NULL DEFAULT '',
    at TEXT NOT NULL,
    day TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS lexicon_attempts_user_day ON lexicon_attempts(userId, day);
  CREATE INDEX IF NOT EXISTS lexicon_attempts_user_source
    ON lexicon_attempts(userId, sourceType, sourceId)`)
}

export function statusOf(row) {
  if (!row) return 'new'
  if (row.mastery >= MASTERED_AT) return 'mastered'
  if (row.mastery >= REVIEWING_AT) return 'reviewing'
  return 'learning'
}

const daysBetween = (from, to) =>
  Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000)

/**
 * Next state of a word after one attempt.
 * attempt: { gain, correct, hinted, day } — gain from FORMATS.
 */
export function applyAttempt(prev, { gain, correct, hinted = false, day }) {
  const s = prev
    ? { ...prev }
    : {
        mastery: 0,
        stage: 0,
        confirmDay: '',
        lastCorrectDay: '',
        countDay: '',
        countCorrect: 0,
        correct: 0,
        wrong: 0,
        firstDay: day,
      }
  s.lastDay = day
  if (!gain) return s
  if (!correct) {
    s.wrong++
    s.mastery = Math.max(0, s.mastery - Math.max(WRONG_MIN, s.mastery * WRONG_SHARE))
    return s
  }
  s.correct++
  if (s.countDay !== day) {
    s.countDay = day
    s.countCorrect = 0
  }
  let value = gain * SAME_DAY_FACTOR ** s.countCorrect
  const pause = s.lastCorrectDay ? daysBetween(s.lastCorrectDay, day) : 0
  if (pause > 0) value *= 1 + Math.min(pause, SPACING_MAX_DAYS) / SPACING_BONUS_DAYS
  if (hinted) value *= HINT_FACTOR
  s.countCorrect++
  s.lastCorrectDay = day
  // Only an answer without a hint confirms the word.
  const next = s.stage + 1
  if (
    !hinted &&
    next < STAGE_CAP.length &&
    (s.stage === 0 || daysBetween(s.confirmDay, day) >= STAGE_GAP_DAYS[next])
  ) {
    s.stage = next
    s.confirmDay = day
  }
  s.mastery = Math.max(s.mastery, Math.min(STAGE_CAP[s.stage], s.mastery + value))
  return s
}

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

function attemptTime(value, now) {
  const t = typeof value === 'string' ? Date.parse(value) : NaN
  // Queued offline answers keep their time; anything odd gets the server's.
  if (Number.isNaN(t) || t > now + 5 * 60000 || t < now - 7 * 86400000) return new Date(now)
  return new Date(t)
}

/** Validated attempts of a POST /api/lexicon/me/progress batch. */
export function parseAttempts(results) {
  if (!Array.isArray(results) || !results.length || results.length > 200)
    fail(400, 'Передайте от 1 до 200 результатов')
  return results.map((r) => {
    if (typeof r?.termId !== 'string' || typeof r.correct !== 'boolean')
      fail(400, 'Некорректный результат')
    if (r.id !== undefined && !(typeof r.id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(r.id)))
      fail(400, 'Некорректный результат')
    const format = r.format === undefined ? 'unknown' : r.format
    if (typeof format !== 'string' || !Object.hasOwn(FORMATS, format))
      fail(400, 'Неизвестный формат упражнения')
    const sourceType = SOURCE_TYPES.has(r.sourceType) ? r.sourceType : ''
    return {
      id: r.id || randomUUID(),
      termId: r.termId,
      correct: r.correct,
      format,
      skipped: r.skipped === true,
      hinted: r.hinted === true,
      sourceType,
      sourceId: sourceType ? text(r.sourceId, 120) : '',
      sourceLabel: sourceType ? text(r.sourceLabel, 200) : '',
      sessionId: text(r.sessionId, 64),
      at: r.at,
    }
  })
}

/**
 * Saves attempts of known words and moves their Mastery. A repeated id
 * (a resend after a network error, a double tap) is ignored.
 * Returns the new statuses of the words in the batch.
 */
export function recordAttempts(db, user, attempts, knownTermIds) {
  const timeZone = user.timeZone || DEFAULT_TIME_ZONE
  const now = Date.now()
  const getState = db.prepare('SELECT * FROM lexicon_progress WHERE userId=? AND termId=?')
  const insert = db.prepare(
    `INSERT OR IGNORE INTO lexicon_attempts
     (id, userId, termId, format, skill, correct, skipped, hinted,
      sourceType, sourceId, sourceLabel, sessionId, at, day)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  const save = db.prepare(
    `INSERT INTO lexicon_progress (userId, termId, status, mastery, stage, confirmDay,
       lastCorrectDay, countDay, countCorrect, correct, wrong, firstDay, lastDay, updated)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(userId, termId) DO UPDATE SET status=excluded.status,
       mastery=excluded.mastery, stage=excluded.stage, confirmDay=excluded.confirmDay,
       lastCorrectDay=excluded.lastCorrectDay, countDay=excluded.countDay,
       countCorrect=excluded.countCorrect, correct=excluded.correct, wrong=excluded.wrong,
       lastDay=excluded.lastDay, updated=excluded.updated`,
  )
  const statuses = {}
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const a of attempts) {
      if (!knownTermIds.has(a.termId)) continue
      const at = attemptTime(a.at, now)
      const day = localDay(at, timeZone)
      const format = FORMATS[a.format]
      const inserted = insert.run(
        a.id,
        user.id,
        a.termId,
        a.format,
        format.skill,
        a.correct ? 1 : 0,
        a.skipped ? 1 : 0,
        a.hinted ? 1 : 0,
        a.sourceType,
        a.sourceId,
        a.sourceLabel,
        a.sessionId,
        at.toISOString(),
        day,
      ).changes
      const prev = getState.get(user.id, a.termId)
      if (inserted) {
        const s = applyAttempt(prev, { gain: format.gain, correct: a.correct, hinted: a.hinted, day })
        const status = statusOf(s)
        save.run(
          user.id,
          a.termId,
          status,
          s.mastery,
          s.stage,
          s.confirmDay,
          s.lastCorrectDay,
          s.countDay,
          s.countCorrect,
          s.correct,
          s.wrong,
          s.firstDay,
          s.lastDay,
          new Date(now).toISOString(),
        )
        statuses[a.termId] = status
      } else statuses[a.termId] = statusOf(prev)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return statuses
}

// "homework", "homework:<id>", "collection:<id>", "topic:<id>" or "" (all).
function parseSource(value) {
  const raw = text(value, 200)
  if (!raw) return null
  const at = raw.indexOf(':')
  const type = at < 0 ? raw : raw.slice(0, at)
  if (!['homework', 'collection', 'topic'].includes(type)) fail(400, 'Неизвестный источник')
  return { type, id: at < 0 ? '' : raw.slice(at + 1) }
}

function streakOf(days, today) {
  const set = new Set(days)
  // Until the end of today, yesterday's streak is still alive.
  let day = set.has(today) ? today : addDays(today, -1)
  let count = 0
  while (set.has(day)) {
    count++
    day = addDays(day, -1)
  }
  return { current: count, today: set.has(today) }
}

function skillSuccess(attempts, from) {
  const bySkill = Object.fromEntries(SKILLS.map((s) => [s, new Map()]))
  const inPeriod = Object.fromEntries(SKILLS.map((s) => [s, 0]))
  // attempts are newest first; hints do not show independent knowledge.
  for (const a of attempts) {
    if (!a.skill || a.hinted) continue
    const words = bySkill[a.skill]
    let w = words.get(a.termId)
    if (!w) words.set(a.termId, (w = { results: [], active: false }))
    if (w.results.length < WINDOW.length) w.results.push(a.correct)
    if (a.day >= from) {
      w.active = true
      inPeriod[a.skill]++
    }
  }
  return Object.fromEntries(
    SKILLS.map((skill) => {
      const active = [...bySkill[skill].values()].filter((w) => w.active)
      const attemptsCount = inPeriod[skill]
      if (attemptsCount < MIN_ATTEMPTS)
        return [skill, { value: null, words: active.length, attempts: attemptsCount, lowSample: true }]
      const sum = active.reduce((total, w) => {
        let score = 0
        let weight = 0
        w.results.forEach((ok, i) => {
          weight += WINDOW[i]
          if (ok) score += WINDOW[i]
        })
        return total + score / weight
      }, 0)
      return [
        skill,
        {
          value: Math.round((sum / active.length) * 100),
          words: active.length,
          attempts: attemptsCount,
          lowSample: active.length < LOW_SAMPLE_WORDS || attemptsCount < LOW_SAMPLE_ATTEMPTS,
        },
      ]
    }),
  )
}

/** All progress metrics of one student for a period ending today. */
export function studentMetrics(db, student, { days = 7, source = null, now = new Date() } = {}) {
  const timeZone = student.timeZone || DEFAULT_TIME_ZONE
  const today = localDay(now, timeZone)
  const from = addDays(today, -(days - 1))
  const filter = source
    ? ` AND sourceType = ?${source.id ? ' AND sourceId = ?' : ''}`
    : ''
  const filterArgs = source ? [source.type, ...(source.id ? [source.id] : [])] : []
  const attempts = db
    .prepare(
      `SELECT termId, skill, correct, hinted, day FROM lexicon_attempts
       WHERE userId = ?${filter} ORDER BY at DESC, rowid DESC`,
    )
    .all(student.id, ...filterArgs)
  const sourceTerms = source ? new Set(attempts.map((a) => a.termId)) : null
  const rows = db
    .prepare('SELECT * FROM lexicon_progress WHERE userId = ?')
    .all(student.id)
    .filter((r) => !sourceTerms || sourceTerms.has(r.termId))

  // Current states; "new" is words first practised within the period.
  const words = { mastered: 0, reviewing: 0, learning: 0 }
  let newWords = 0
  for (const r of rows) {
    words[statusOf(r)]++
    if (r.firstDay >= from) newWords++
  }

  const activityByDay = new Map()
  for (const a of attempts) {
    if (a.day < from) continue
    let d = activityByDay.get(a.day)
    if (!d) activityByDay.set(a.day, (d = { attempts: 0, terms: new Set() }))
    d.attempts++
    d.terms.add(a.termId)
  }
  const activity = Array.from({ length: days }, (_, i) => {
    const day = addDays(from, i)
    const d = activityByDay.get(day)
    return { day, attempts: d?.attempts || 0, words: d?.terms.size || 0 }
  })

  const practiceDays = db
    .prepare('SELECT DISTINCT day FROM lexicon_attempts WHERE userId = ?')
    .all(student.id)
    .map((r) => r.day)

  const revisitIds = rows
    .filter((r) => r.wrong > 0 && statusOf(r) !== 'mastered')
    .sort((a, b) => a.mastery - b.mastery || b.lastDay.localeCompare(a.lastDay))
    .slice(0, 10)
  const termStmt = db.prepare(
    'SELECT id, term, translation, transcription FROM lexicon_terms WHERE id = ?',
  )
  const revisit = revisitIds
    .map((r) => {
      const t = termStmt.get(r.termId)
      return t && { ...t, mastery: Math.round(r.mastery), status: statusOf(r) }
    })
    .filter(Boolean)

  return {
    timeZone,
    today,
    from,
    days,
    words,
    newWords,
    streak: streakOf(practiceDays, today),
    activity,
    skills: skillSuccess(attempts, from),
    revisit,
  }
}

/** Sources the student practised with, for the teacher's filter. */
function studentSources(db, studentId) {
  const homeworkTitle = db.prepare('SELECT title FROM homework WHERE id = ?')
  const subtopicTitle = db.prepare(
    `SELECT t.title || ' · ' || s.title AS title FROM vocab_subtopics s
     JOIN vocab_topics t ON t.id = s.topicId WHERE s.id = ?`,
  )
  const current = { homework: homeworkTitle, topic: subtopicTitle }
  return db
    .prepare(
      `SELECT sourceType AS type, sourceId AS id, max(sourceLabel) AS label, max(at) AS last
       FROM lexicon_attempts
       WHERE userId = ? AND sourceType IN ('homework', 'collection', 'topic') AND sourceId != ''
       GROUP BY sourceType, sourceId ORDER BY last DESC`,
    )
    .all(studentId)
    .map((s) => ({
      type: s.type,
      id: s.id,
      label: current[s.type]?.get(s.id)?.title || s.label || 'Без названия',
    }))
}

function periodOf(params) {
  const raw = params.get('days')
  if (raw === null) return 7
  const days = Number(raw)
  if (!PERIODS.includes(days)) fail(400, 'Неизвестный период')
  return days
}

export function lexiconMetricsRoute({ path, req, db, user, send }) {
  if (req.method !== 'GET') return false
  const params = new URL(req.url, 'http://localhost').searchParams

  if (path === '/api/lexicon/me/metrics') {
    send(200, studentMetrics(db, user, { days: periodOf(params) }))
    return true
  }

  const match = /^\/api\/lexicon\/students\/([^/]+)\/metrics$/.exec(path)
  if (match) {
    if (!staff(user)) fail(403, 'Нет доступа')
    const row = db
      .prepare('SELECT id, roles, teacherId, timeZone FROM users WHERE id = ? AND archived = 0')
      .get(decodeURIComponent(match[1]))
    const student = row && { ...row, roles: JSON.parse(row.roles) }
    if (!student?.roles.includes('student')) fail(404, 'Ученик не найден')
    if (!privileged(user) && student.teacherId !== user.id) fail(403, 'Нет доступа')
    send(200, {
      ...studentMetrics(db, student, {
        days: periodOf(params),
        source: parseSource(params.get('source')),
      }),
      sources: studentSources(db, student.id),
    })
    return true
  }
  return false
}
