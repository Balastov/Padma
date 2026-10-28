import { randomUUID } from 'node:crypto'
import { privileged, staff } from './store.mjs'
import { addDays } from './timezone.mjs'

// Recurring lessons. A series stores the rule; every occurrence is a real
// lessons row (lesson words and homework hang off lesson ids). Each row keeps
// its rule slot in `occurrence` ("YYYY-MM-DDTHH:MM-HH:MM"), so a lesson moved
// "only this time" is still recognised as that slot.
//
// Statuses: scheduled, cancelled, noshow. Lesson topics follow the series plan
// by order of scheduled lessons, so cancelling, no-show or deleting shifts
// later topics. A count-limited series is a package of N lessons: cancelled
// and deleted lessons extend it, a no-show uses up a lesson.

const fail = (status, message, details) => {
  throw Object.assign(new Error(message), { status, details })
}
const text = (value, max = 200) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''
const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
const DEFAULT_TITLE = 'Английский язык'
const STATUSES = ['scheduled', 'cancelled', 'noshow']
// Open-ended series are generated this far ahead and extended on read.
const HORIZON_DAYS = 112
const MAX_COUNT = 200
const MAX_PLAN = 300
const MAX_SPAN_DAYS = 731
const PAST_START_DAYS = 60

export function initLessons(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS lesson_series (
    id TEXT PRIMARY KEY, studentId TEXT NOT NULL REFERENCES users(id), teacherId TEXT NOT NULL REFERENCES users(id),
    startDate TEXT NOT NULL, everyWeeks INTEGER NOT NULL DEFAULT 1, days TEXT NOT NULL,
    endType TEXT NOT NULL, until TEXT, count INTEGER,
    title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', plan TEXT NOT NULL DEFAULT '[]',
    skipped TEXT NOT NULL DEFAULT '[]', conflictMode TEXT NOT NULL DEFAULT 'skip',
    activeFrom TEXT NOT NULL DEFAULT '', seqOffset INTEGER NOT NULL DEFAULT 0,
    planOffset INTEGER NOT NULL DEFAULT 0, countOffset INTEGER NOT NULL DEFAULT 0,
    generatedUntil TEXT NOT NULL DEFAULT ''
  )`)
  const columns = db
    .prepare('PRAGMA table_info(lessons)')
    .all()
    .map((column) => column.name)
  for (const [name, sql] of [
    ['seriesId', 'seriesId TEXT REFERENCES lesson_series(id)'],
    ['occurrence', `occurrence TEXT NOT NULL DEFAULT ''`],
    ['status', `status TEXT NOT NULL DEFAULT 'scheduled'`],
    ['seq', 'seq INTEGER NOT NULL DEFAULT 0'],
    ['customTitle', 'customTitle INTEGER NOT NULL DEFAULT 0'],
  ])
    if (!columns.includes(name))
      db.exec(`ALTER TABLE lessons ADD COLUMN ${sql}`)
  db.exec(`CREATE INDEX IF NOT EXISTS lessons_series ON lessons(seriesId);
    CREATE INDEX IF NOT EXISTS lessons_date ON lessons(date)`)
}

const moscowClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
function moscowNow() {
  const value = moscowClock.format(new Date())
  return {
    day: value.slice(0, 10),
    key: `${value.slice(0, 10)}T${value.slice(11, 16)}`,
  }
}
const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value
const validTimes = (start, end) =>
  [start, end].every((v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) &&
  minutes(start) < minutes(end)
const isoWeekday = (day) => new Date(day + 'T12:00:00Z').getUTCDay() || 7
const mondayOf = (day) => addDays(day, 1 - isoWeekday(day))
const daysBetween = (a, b) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 864e5)
const lessonKey = (lesson) => `${lesson.date}T${lesson.start}`
const slotKey = (date, start, end) => `${date}T${start}-${end}`

const publicLesson = (row) => ({
  ...row,
  customTitle: Boolean(row.customTitle),
})
function loadSeries(db, id) {
  const row = db.prepare('SELECT * FROM lesson_series WHERE id=?').get(id)
  if (!row) return null
  return {
    ...row,
    days: JSON.parse(row.days),
    plan: JSON.parse(row.plan),
    skipped: JSON.parse(row.skipped),
  }
}
const publicSeries = (s) => ({
  id: s.id,
  studentId: s.studentId,
  teacherId: s.teacherId,
  startDate: s.startDate,
  everyWeeks: s.everyWeeks,
  days: s.days,
  endType: s.endType,
  until: s.until,
  count: s.count,
  title: s.title,
  note: s.note,
  plan: s.plan,
})
function saveSeries(db, s, insert = false) {
  const values = [
    s.studentId,
    s.teacherId,
    s.startDate,
    s.everyWeeks,
    JSON.stringify(s.days),
    s.endType,
    s.until,
    s.count,
    s.title,
    s.note,
    JSON.stringify(s.plan),
    JSON.stringify([...new Set(s.skipped)]),
    s.conflictMode,
    s.activeFrom,
    s.seqOffset,
    s.planOffset,
    s.countOffset,
    s.generatedUntil,
  ]
  if (insert)
    db.prepare(
      `INSERT INTO lesson_series (studentId,teacherId,startDate,everyWeeks,days,endType,until,count,title,note,plan,skipped,conflictMode,activeFrom,seqOffset,planOffset,countOffset,generatedUntil,id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(...values, s.id)
  else
    db.prepare(
      `UPDATE lesson_series SET studentId=?,teacherId=?,startDate=?,everyWeeks=?,days=?,endType=?,until=?,count=?,title=?,note=?,plan=?,skipped=?,conflictMode=?,activeFrom=?,seqOffset=?,planOffset=?,countOffset=?,generatedUntil=? WHERE id=?`,
    ).run(...values, s.id)
}
function insertLesson(db, lesson) {
  db.prepare(
    'INSERT INTO lessons (id,studentId,teacherId,date,start,end,title,note,seriesId,occurrence) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(
    lesson.id,
    lesson.studentId,
    lesson.teacherId,
    lesson.date,
    lesson.start,
    lesson.end,
    lesson.title,
    lesson.note,
    lesson.seriesId ?? null,
    lesson.occurrence ?? '',
  )
}
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

// Cancelled and no-show lessons free the time.
function findConflict(
  db,
  { teacherId, studentId, date, start, end },
  excludeId = '',
) {
  return db
    .prepare(
      `SELECT l.start, l.end FROM lessons l JOIN users u ON l.studentId=u.id
       WHERE u.archived=0 AND l.status='scheduled' AND l.date=? AND (l.teacherId=? OR l.studentId=?)
         AND l.start<? AND l.end>? AND l.id!=?`,
    )
    .get(date, teacherId, studentId, end, start, excludeId)
}
const conflictInfo = (slot, busy) => ({
  date: slot.date,
  start: slot.start,
  end: slot.end,
  busyStart: busy.start,
  busyEnd: busy.end,
})
const conflictError = (conflicts) =>
  fail(409, 'Есть пересечения с другими занятиями', { conflicts })

function* occurrences(s) {
  const step = 7 * s.everyWeeks
  for (let week = mondayOf(s.startDate); ; week = addDays(week, step))
    for (const day of s.days) {
      const date = addDays(week, day.weekday - 1)
      if (date >= s.startDate)
        yield { key: slotKey(date, day.start, day.end), ...day, date }
    }
}
// Whether an existing lesson still belongs to the current rule as-is.
function isRuleSlot(s, skipped, key) {
  const date = key.slice(0, 10)
  if (date < s.startDate || key < s.activeFrom || skipped.has(key)) return false
  const day = s.days.find((d) => d.weekday === isoWeekday(date))
  return (
    Boolean(day) &&
    key === slotKey(date, day.start, day.end) &&
    (daysBetween(mondayOf(s.startDate), mondayOf(date)) / 7) % s.everyWeeks ===
      0
  )
}

// Brings the series rows in line with its rule. Past lessons and future
// cancelled/no-show lessons stay as they are. Future scheduled lessons on a
// rule slot are kept (even if moved); the rest are reused in order for new
// slots, so a rescheduled series keeps lesson ids and attached words.
// mode: 'fail' collects conflicts and throws 409, 'skip' leaves the slot out
// for good, 'overlap' creates the lesson anyway.
function materialize(db, s, mode, now) {
  const all = db
    .prepare('SELECT * FROM lessons WHERE seriesId=? ORDER BY date,start')
    .all(s.id)
  const pool = all.filter(
    (l) => l.status === 'scheduled' && lessonKey(l) > now.key,
  )
  const fixed = all.filter((l) => !pool.includes(l))
  const fixedSlots = new Set(fixed.map((l) => l.occurrence))
  const skipped = new Set(s.skipped)
  const matched = new Map()
  for (const l of pool)
    if (
      !fixedSlots.has(l.occurrence) &&
      !matched.has(l.occurrence) &&
      isRuleSlot(s, skipped, l.occurrence)
    )
      matched.set(l.occurrence, l)
  const spare = pool.filter((l) => matched.get(l.occurrence) !== l)
  const kept = new Set()
  const conflicts = []
  let used = fixed.filter((l) => l.status !== 'cancelled').length
  const total = s.endType === 'count' ? s.count - s.countOffset : Infinity
  const horizon = addDays(now.day, HORIZON_DAYS)
  const limit =
    s.endType === 'until'
      ? s.until
      : s.endType === 'never'
        ? horizon
        : addDays(s.startDate, 10 * 366)
  for (const slot of occurrences(s)) {
    if (slot.date > limit || used >= total) break
    if (fixedSlots.has(slot.key)) continue
    const own = matched.get(slot.key)
    if (own) {
      kept.add(own.id)
      used++
      continue
    }
    if (slot.key < s.activeFrom || skipped.has(slot.key)) continue
    const reuse = spare[0]
    const busy = findConflict(db, { ...s, ...slot }, reuse?.id)
    if (busy && mode === 'skip') {
      skipped.add(slot.key)
      continue
    }
    if (busy && mode === 'fail') conflicts.push(conflictInfo(slot, busy))
    if (reuse) {
      spare.shift()
      kept.add(reuse.id)
      db.prepare(
        'UPDATE lessons SET date=?,start=?,end=?,occurrence=? WHERE id=?',
      ).run(slot.date, slot.start, slot.end, slot.key, reuse.id)
    } else
      insertLesson(db, {
        id: randomUUID(),
        studentId: s.studentId,
        teacherId: s.teacherId,
        date: slot.date,
        start: slot.start,
        end: slot.end,
        title: s.title,
        note: s.note,
        seriesId: s.id,
        occurrence: slot.key,
      })
    used++
  }
  if (conflicts.length) conflictError(conflicts)
  for (const l of pool)
    if (!kept.has(l.id)) db.prepare('DELETE FROM lessons WHERE id=?').run(l.id)
  s.skipped = [...skipped]
  s.generatedUntil = s.endType === 'never' ? horizon : ''
  saveSeries(db, s)
  renumber(db, s)
}

// Scheduled lessons are numbered in order and take plan topics in order. A
// lesson with a title set by hand replaces the topic, so the planned topic
// moves on to the next lesson.
function renumber(db, s) {
  const rows = db
    .prepare(
      `SELECT id,title,customTitle FROM lessons WHERE seriesId=? AND status='scheduled' ORDER BY date,start`,
    )
    .all(s.id)
  let topic = s.planOffset
  rows.forEach((l, i) => {
    db.prepare('UPDATE lessons SET seq=?,title=? WHERE id=?').run(
      s.seqOffset + i + 1,
      l.customTitle ? l.title : s.plan[topic++] || s.title,
      l.id,
    )
  })
  db.prepare(
    `UPDATE lessons SET seq=0 WHERE seriesId=? AND status!='scheduled'`,
  ).run(s.id)
}

function extendOpenSeries(db, now) {
  const due = db
    .prepare(
      `SELECT s.id FROM lesson_series s JOIN users u ON s.studentId=u.id
       WHERE u.archived=0 AND s.endType='never' AND s.generatedUntil<?`,
    )
    .all(addDays(now.day, HORIZON_DAYS))
  if (!due.length) return
  transaction(db, () => {
    for (const { id } of due) {
      const s = loadSeries(db, id)
      materialize(db, s, s.conflictMode, now)
    }
  })
}

function readRule(data, startDate) {
  const r = data.recurrence
  if (!r || typeof r !== 'object') fail(400, 'Укажите правило повторения')
  const everyWeeks = Number(r.everyWeeks)
  if (!Number.isInteger(everyWeeks) || everyWeeks < 1 || everyWeeks > 12)
    fail(400, 'Повторять: раз в 1–12 недель')
  if (!Array.isArray(r.days) || !r.days.length || r.days.length > 7)
    fail(400, 'Выберите дни недели')
  const seen = new Set()
  const days = r.days.map((d) => {
    const day = {
      weekday: Number(d?.weekday),
      start: text(d?.start, 5),
      end: text(d?.end, 5),
    }
    if (
      !Number.isInteger(day.weekday) ||
      day.weekday < 1 ||
      day.weekday > 7 ||
      seen.has(day.weekday)
    )
      fail(400, 'Выберите дни недели без повторов')
    seen.add(day.weekday)
    if (!validTimes(day.start, day.end))
      fail(400, 'Укажите время для каждого дня: конец позже начала')
    return day
  })
  days.sort((a, b) => a.weekday - b.weekday)
  if (!['never', 'until', 'count'].includes(r.endType))
    fail(400, 'Выберите окончание серии')
  let until = null,
    count = null
  if (r.endType === 'until') {
    until = text(r.until, 10)
    if (
      !validDate(until) ||
      until < startDate ||
      until > addDays(startDate, MAX_SPAN_DAYS)
    )
      fail(400, 'Дата окончания: не раньше начала и не дальше двух лет')
  }
  if (r.endType === 'count') {
    count = Number(r.count)
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT)
      fail(400, `Количество уроков: от 1 до ${MAX_COUNT}`)
  }
  if (r.plan !== undefined && !Array.isArray(r.plan))
    fail(400, 'План тем должен быть списком')
  if ((r.plan || []).length > MAX_PLAN)
    fail(400, `План тем: не больше ${MAX_PLAN} строк`)
  const plan = (r.plan || []).map((topic) => text(topic))
  while (plan.length && !plan[plan.length - 1]) plan.pop()
  return { everyWeeks, days, endType: r.endType, until, count, plan }
}
function readStartDate(value, now) {
  const date = text(value, 10)
  if (!validDate(date)) fail(400, 'Укажите корректную дату начала')
  if (date < addDays(now.day, -PAST_START_DAYS))
    fail(
      400,
      `Серия может начинаться не раньше чем ${PAST_START_DAYS} дней назад`,
    )
  return date
}
const readMode = (value) =>
  ['skip', 'overlap'].includes(value) ? value : 'fail'
const canManage = (user, item) =>
  privileged(user) ||
  (user.roles.includes('teacher') && item.teacherId === user.id)

export async function lessonsRoute({
  path,
  req,
  db,
  user,
  body,
  send,
  getUser,
}) {
  const now = moscowNow()
  if (path === '/api/lessons' && req.method === 'GET') {
    extendOpenSeries(db, now)
    const all = db
      .prepare(
        'SELECT l.* FROM lessons l JOIN users u ON l.studentId=u.id WHERE u.archived=0 ORDER BY date,start',
      )
      .all()
    send(
      200,
      all
        .filter(
          (l) =>
            privileged(user) ||
            l.teacherId === user.id ||
            l.studentId === user.id,
        )
        .map(publicLesson),
    )
    return true
  }
  if (path === '/api/lesson-series' && req.method === 'GET') {
    const rows = db
      .prepare(
        'SELECT s.id FROM lesson_series s JOIN users u ON s.studentId=u.id WHERE u.archived=0',
      )
      .all()
      .map((row) => loadSeries(db, row.id))
      .filter(
        (s) =>
          privileged(user) ||
          s.teacherId === user.id ||
          s.studentId === user.id,
      )
    send(200, rows.map(publicSeries))
    return true
  }
  if (path === '/api/lessons' && req.method === 'POST') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const data = await body(req)
    const student = getUser(data.studentId)
    if (
      !student?.roles.includes('student') ||
      !(privileged(user) || student.teacherId === user.id)
    )
      fail(403, 'Ученик недоступен')
    if (!student.teacherId) fail(400, 'Сначала назначьте ученику учителя')
    const mode = readMode(data.conflicts)
    const title = text(data.title) || DEFAULT_TITLE,
      note = text(data.note, 500)
    if (!data.recurrence) {
      const date = text(data.date, 10),
        start = text(data.start, 5),
        end = text(data.end, 5)
      if (!validDate(date) || !validTimes(start, end))
        fail(400, 'Укажите корректные дату и время: конец позже начала')
      const lesson = {
        id: randomUUID(),
        studentId: student.id,
        teacherId: student.teacherId,
        date,
        start,
        end,
        title,
        note,
      }
      transaction(db, () => {
        const busy = findConflict(db, lesson)
        if (busy && mode !== 'overlap')
          conflictError([conflictInfo(lesson, busy)])
        insertLesson(db, lesson)
      })
      const row = db.prepare('SELECT * FROM lessons WHERE id=?').get(lesson.id)
      send(201, [publicLesson(row)])
      return true
    }
    const startDate = readStartDate(data.date, now)
    const s = {
      id: randomUUID(),
      studentId: student.id,
      teacherId: student.teacherId,
      startDate,
      ...readRule(data, startDate),
      title,
      note,
      skipped: [],
      conflictMode: mode === 'overlap' ? 'overlap' : 'skip',
      activeFrom: '',
      seqOffset: 0,
      planOffset: 0,
      countOffset: 0,
      generatedUntil: '',
    }
    const created = transaction(db, () => {
      saveSeries(db, s, true)
      materialize(db, s, mode, now)
      const rows = db
        .prepare('SELECT * FROM lessons WHERE seriesId=? ORDER BY date,start')
        .all(s.id)
      if (!rows.length)
        fail(400, 'По этому правилу не получилось ни одного занятия')
      return rows
    })
    send(201, created.map(publicLesson))
    return true
  }
  const seriesMatch = /^\/api\/lesson-series\/([^/]+)$/.exec(path)
  if (seriesMatch && req.method === 'PUT') {
    const s = loadSeries(db, seriesMatch[1])
    if (!s) fail(404, 'Серия не найдена')
    if (!canManage(user, s)) fail(403, 'Нет доступа')
    const data = await body(req)
    const mode = readMode(data.conflicts)
    const title = text(data.title) || DEFAULT_TITLE,
      note = text(data.note, 500)
    let from = null
    if (data.scope === 'following') {
      from = db
        .prepare('SELECT * FROM lessons WHERE id=? AND seriesId=?')
        .get(text(data.fromLessonId, 64), s.id)
      if (!from) fail(400, 'Выберите урок, с которого менять серию')
    } else if (data.scope !== 'all')
      fail(400, 'Выберите, к каким урокам применить')
    const startDate = from
      ? readStartDate(data.startDate || from.date, now)
      : s.startDate
    const rule = readRule(data, startDate)
    const before = from
      ? db
          .prepare(
            'SELECT status,customTitle FROM lessons WHERE seriesId=? AND occurrence<?',
          )
          .all(s.id, from.occurrence)
      : []
    const target = transaction(db, () => {
      let next = s
      if (before.length) {
        // "This and following": the old series ends before the lesson,
        // the rest moves to a new series that continues numbering and count.
        next = {
          ...s,
          id: randomUUID(),
          startDate,
          skipped: s.skipped.filter((key) => key >= from.occurrence),
          seqOffset:
            s.seqOffset + before.filter((l) => l.status === 'scheduled').length,
          planOffset:
            s.planOffset +
            before.filter((l) => l.status === 'scheduled' && !l.customTitle)
              .length,
          countOffset:
            s.countOffset +
            before.filter((l) => l.status !== 'cancelled').length,
        }
        s.endType = 'until'
        s.until = addDays(from.occurrence.slice(0, 10), -1)
        s.count = null
        saveSeries(db, s)
        saveSeries(db, next, true)
        db.prepare(
          'UPDATE lessons SET seriesId=? WHERE seriesId=? AND occurrence>=?',
        ).run(next.id, s.id, from.occurrence)
        renumber(db, s)
      } else next.startDate = startDate
      Object.assign(next, rule, { title, note })
      if (next.activeFrom < now.key) next.activeFrom = now.key
      if (next.endType === 'count' && next.count <= next.countOffset)
        fail(400, 'В серии уже столько уроков: увеличьте количество')
      if (mode !== 'fail') next.conflictMode = mode
      db.prepare(
        `UPDATE lessons SET note=? WHERE seriesId=? AND status='scheduled' AND date||'T'||start>?`,
      ).run(note, next.id, now.key)
      materialize(db, next, mode, now)
      return next
    })
    send(200, publicSeries(target))
    return true
  }
  const statusMatch = /^\/api\/lessons\/([^/]+)\/status$/.exec(path)
  const lessonMatch = /^\/api\/lessons\/([^/]+)$/.exec(path)
  const id = statusMatch?.[1] || lessonMatch?.[1]
  if (!id) return false
  const lesson = db.prepare('SELECT * FROM lessons WHERE id=?').get(id)
  if (!lesson) fail(404, 'Занятие не найдено')
  if (!canManage(user, lesson)) fail(403, 'Нет доступа')
  const series = lesson.seriesId ? loadSeries(db, lesson.seriesId) : null
  if (statusMatch && req.method === 'POST') {
    const data = await body(req)
    if (!STATUSES.includes(data.status)) fail(400, 'Неизвестный статус занятия')
    transaction(db, () => {
      if (data.status === 'scheduled' && lesson.status !== 'scheduled') {
        const busy = findConflict(db, lesson, lesson.id)
        if (busy && readMode(data.conflicts) !== 'overlap')
          conflictError([conflictInfo(lesson, busy)])
      }
      db.prepare('UPDATE lessons SET status=? WHERE id=?').run(data.status, id)
      if (series) materialize(db, series, series.conflictMode, now)
    })
    send(
      200,
      publicLesson(db.prepare('SELECT * FROM lessons WHERE id=?').get(id)),
    )
    return true
  }
  if (lessonMatch && req.method === 'PATCH') {
    const data = await body(req)
    const date = text(data.date, 10),
      start = text(data.start, 5),
      end = text(data.end, 5)
    if (!validDate(date) || !validTimes(start, end))
      fail(400, 'Укажите корректные дату и время: конец позже начала')
    const typed = text(data.title)
    // In a series an empty or untouched title keeps following the plan.
    const custom = series
      ? Boolean(typed) &&
        (typed !== lesson.title || Boolean(lesson.customTitle))
      : false
    const title = series && !custom ? lesson.title : typed || DEFAULT_TITLE
    transaction(db, () => {
      const moved = { ...lesson, date, start, end }
      const busy = lesson.status === 'scheduled' && findConflict(db, moved, id)
      if (busy && readMode(data.conflicts) !== 'overlap')
        conflictError([conflictInfo(moved, busy)])
      db.prepare(
        'UPDATE lessons SET date=?,start=?,end=?,title=?,note=?,customTitle=? WHERE id=?',
      ).run(date, start, end, title, text(data.note, 500), custom ? 1 : 0, id)
      if (series) renumber(db, series)
    })
    send(
      200,
      publicLesson(db.prepare('SELECT * FROM lessons WHERE id=?').get(id)),
    )
    return true
  }
  if (lessonMatch && req.method === 'DELETE') {
    const data = await body(req)
    const scope = series ? data.scope || 'this' : 'this'
    if (!['this', 'following', 'all'].includes(scope))
      fail(400, 'Выберите, какие занятия удалить')
    transaction(db, () => {
      if (scope === 'this') {
        db.prepare('DELETE FROM lessons WHERE id=?').run(id)
        if (series) {
          series.skipped.push(lesson.occurrence)
          materialize(db, series, series.conflictMode, now)
        }
        return
      }
      if (scope === 'following')
        db.prepare(
          'DELETE FROM lessons WHERE seriesId=? AND occurrence>=?',
        ).run(series.id, lesson.occurrence)
      else db.prepare('DELETE FROM lessons WHERE seriesId=?').run(series.id)
      const left = db
        .prepare('SELECT count(*) AS n FROM lessons WHERE seriesId=?')
        .get(series.id).n
      if (!left) {
        db.prepare('DELETE FROM lesson_series WHERE id=?').run(series.id)
        return
      }
      series.endType = 'until'
      series.until = addDays(lesson.occurrence.slice(0, 10), -1)
      series.count = null
      saveSeries(db, series)
      renumber(db, series)
    })
    send(200, { ok: true })
    return true
  }
  return false
}
