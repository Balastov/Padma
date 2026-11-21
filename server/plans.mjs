import { randomUUID } from 'node:crypto'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { privileged, staff } from './store.mjs'
import {
  KEEP_DAYS,
  MAX_FILES,
  attachFiles,
  dropFileRows,
  listFiles,
  unlinkFiles,
} from './files.mjs'
import { insertHomework, lexiconFromBody } from './homework.mjs'
import { moscowNow } from './lessons.mjs'

// Study plans («Планы обучения»). A program is a template (studentId NULL)
// of blocks with lessons; assigning it to a student makes the student's own
// copy, which can then be changed for that student. A student has at most
// one plan.
//
// The plan follows lessons, not dates. Counted lessons are the student's
// scheduled lessons from the plan's start date that are not marked «вне
// плана»; cancelled lessons and no-shows do not count. Each time a counted
// lesson ends, the homework of the next plan lesson is issued: text with
// links, files, words from the dictionary and grammar from the library. Its
// due date is the day of the student's next lesson. Issued homework is never
// taken back; marking a past lesson «вне плана» only delays the next one.

const fail = (status, message, details) => {
  throw Object.assign(new Error(message), { status, details })
}
const clean = (value, max) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''
const MAX_TITLE = 200
const MAX_TEXT = 10000
const MAX_BLOCKS = 100
const MAX_LESSONS = 300
const MAX_GRAMMAR = 30
const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value
const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
const transaction = (db, fn) => {
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

export function initPlans(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY, title TEXT NOT NULL,
    authorId TEXT NOT NULL REFERENCES users(id),
    studentId TEXT REFERENCES users(id),
    sourceId TEXT NOT NULL DEFAULT '',
    startDate TEXT NOT NULL DEFAULT '',
    created TEXT NOT NULL, updated TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plan_blocks (
    id TEXT PRIMARY KEY,
    planId TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '', sortOrder INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS plan_lessons (
    id TEXT PRIMARY KEY,
    planId TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    blockId TEXT NOT NULL REFERENCES plan_blocks(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '', homework TEXT NOT NULL DEFAULT '',
    lexicon TEXT NOT NULL DEFAULT '[]', grammar TEXT NOT NULL DEFAULT '[]',
    sortOrder INTEGER NOT NULL DEFAULT 0
  );
  -- A plan lesson whose turn has come; homeworkId is empty when the lesson
  -- had nothing to give. Rows outlive deleted plan lessons: they keep the
  -- count of passed lessons.
  CREATE TABLE IF NOT EXISTS plan_issues (
    planLessonId TEXT PRIMARY KEY, planId TEXT NOT NULL,
    lessonId TEXT NOT NULL DEFAULT '', homeworkId TEXT NOT NULL DEFAULT '',
    issued TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS plans_student ON plans(studentId);
  CREATE INDEX IF NOT EXISTS plan_blocks_plan ON plan_blocks(planId);
  CREATE INDEX IF NOT EXISTS plan_lessons_plan ON plan_lessons(planId);
  CREATE INDEX IF NOT EXISTS plan_issues_plan ON plan_issues(planId);`)
}

/** Plan lessons in order: blocks first, then lessons inside a block. */
const planSteps = (db, planId) =>
  db
    .prepare(
      `SELECT pl.* FROM plan_lessons pl JOIN plan_blocks b ON b.id = pl.blockId
       WHERE pl.planId = ? ORDER BY b.sortOrder, b.rowid, pl.sortOrder, pl.rowid`,
    )
    .all(planId)

/** Lessons of the student from the start date, in time order. */
const lessonsFrom = (db, plan) =>
  db
    .prepare(
      `SELECT id, date, start, end, status, offPlan FROM lessons
       WHERE studentId = ? AND date >= ? ORDER BY date, start, id`,
    )
    .all(plan.studentId, plan.startDate)
const counts = (lesson) => lesson.status === 'scheduled' && !lesson.offPlan
const issuedCount = (db, planId) =>
  db.prepare('SELECT count(*) AS n FROM plan_issues WHERE planId = ?').get(planId)
    .n

/** Lesson id → its place in the student's plan, for the calendar. */
export function lessonPlanInfo(db) {
  const result = new Map()
  const plans = db
    .prepare('SELECT id, title, studentId, startDate FROM plans WHERE studentId IS NOT NULL')
    .all()
  for (const plan of plans) {
    const steps = planSteps(db, plan.id)
    let number = 0
    for (const lesson of lessonsFrom(db, plan)) {
      const n = counts(lesson) ? ++number : 0
      const step = n ? steps[n - 1] : null
      result.set(lesson.id, {
        planId: plan.id,
        title: plan.title,
        number: step ? n : null,
        lessonTitle: step?.title || '',
        total: steps.length,
      })
    }
  }
  return result
}

const existingGrammar = (db, ids) => {
  if (!ids.length) return []
  const known = new Set(
    db
      .prepare(
        `SELECT id FROM library_items WHERE category = 'grammar'
         AND id IN (${ids.map(() => '?').join(',')})`,
      )
      .all(...ids)
      .map((r) => r.id),
  )
  return ids.filter((id) => known.has(id))
}

/** Copies stored files on disk; returns the new ids (missing files skipped). */
async function copyStoredFiles(store, files) {
  const copies = []
  for (const file of files) {
    const id = randomUUID()
    const target = store.path(id)
    try {
      await mkdir(dirname(target), { recursive: true, mode: 0o700 })
      await copyFile(store.path(file.id), target)
      copies.push({ ...file, id })
    } catch {
      // A file that is gone on disk is simply not copied.
    }
  }
  return copies
}
const insertFileRow = (db, ownerId, file, kind, refId, expires) =>
  db
    .prepare(
      'INSERT INTO files (id,ownerId,name,size,kind,refId,created,expires) VALUES (?,?,?,?,?,?,?,?)',
    )
    .run(
      file.id,
      ownerId,
      file.name,
      file.size,
      kind,
      refId,
      new Date().toISOString(),
      expires,
    )

/** Gives the homework of one plan lesson for the counted lesson that ended. */
async function issueStep(db, store, plan, step, number, lesson, now) {
  const files = listFiles(db, 'plan', step.id).filter((f) => !f.deleted)
  const sources = parseJson(step.lexicon, []).filter((s) => s.words?.length)
  const grammar = existingGrammar(db, parseJson(step.grammar, []))
  const text = step.homework.trim()
  const created = new Date().toISOString()
  const record = (homeworkId) =>
    db
      .prepare(
        'INSERT INTO plan_issues (planLessonId, planId, lessonId, homeworkId, issued) VALUES (?,?,?,?,?)',
      )
      .run(step.id, plan.id, lesson.id, homeworkId, created)
  if (!text && !files.length && !sources.length && !grammar.length) {
    record('')
    return
  }
  const next = db
    .prepare(
      `SELECT date FROM lessons WHERE studentId = ? AND status = 'scheduled'
       AND (date || 'T' || start) > ? ORDER BY date, start LIMIT 1`,
    )
    .get(plan.studentId, now.key)
  const item = {
    id: randomUUID(),
    studentId: plan.studentId,
    authorId: plan.authorId,
    title: `Урок ${number} — ${step.title || plan.title}`.slice(0, MAX_TITLE),
    description: text || 'Задание к уроку — материалы ниже.',
    due: next?.date || '',
    created,
  }
  const copies = await copyStoredFiles(store, files)
  const expires = new Date(Date.now() + KEEP_DAYS * 864e5).toISOString()
  try {
    transaction(db, () => {
      insertHomework(
        db,
        item,
        sources.map((s) => ({ ...s, refId: s.id || '' })),
        grammar,
      )
      for (const file of copies)
        insertFileRow(db, plan.authorId, file, 'homework', item.id, expires)
      record(item.id)
    })
  } catch (error) {
    await unlinkFiles(
      store,
      copies.map((f) => f.id),
    )
    throw error
  }
}

/**
 * Issues homework for every counted lesson that has ended. `now` is the
 * Moscow clock ({ key: 'YYYY-MM-DDTHH:MM' }). Returns how many plan lessons
 * passed.
 */
export async function issuePlanHomework(db, store, now = moscowNow()) {
  const plans = db
    .prepare(
      `SELECT p.* FROM plans p JOIN users u ON u.id = p.studentId
       WHERE u.archived = 0 ORDER BY p.created`,
    )
    .all()
  let passed = 0
  for (const plan of plans) {
    const ended = lessonsFrom(db, plan).filter(
      (l) => counts(l) && `${l.date}T${l.end}` <= now.key,
    )
    let done = issuedCount(db, plan.id)
    if (done >= ended.length) continue
    const steps = planSteps(db, plan.id)
    const given = new Set(
      db
        .prepare('SELECT planLessonId FROM plan_issues WHERE planId = ?')
        .all(plan.id)
        .map((r) => r.planLessonId),
    )
    for (const [index, step] of steps.entries()) {
      if (done >= ended.length) break
      if (given.has(step.id)) continue
      await issueStep(db, store, plan, step, index + 1, ended[done], now)
      done++
      passed++
    }
  }
  return passed
}

/** Plan files are readable by those who can see the plan. */
export function canSeePlanFile(db, user, getUser, stepId) {
  if (!staff(user)) return false
  const plan = db
    .prepare(
      'SELECT p.* FROM plans p JOIN plan_lessons l ON l.planId = p.id WHERE l.id = ?',
    )
    .get(stepId)
  return Boolean(plan && planAccess(user, getUser, plan).view)
}

function planAccess(user, getUser, plan) {
  if (!staff(user)) return { view: false, edit: false }
  if (privileged(user)) return { view: true, edit: true }
  if (!plan.studentId) return { view: true, edit: plan.authorId === user.id }
  const mine =
    plan.authorId === user.id || getUser(plan.studentId)?.teacherId === user.id
  return { view: mine, edit: mine }
}

const lexiconOf = (step) =>
  parseJson(step.lexicon, []).map((s) => ({
    kind: s.kind,
    id: s.id || '',
    title: s.title,
    parentTitle: s.parentTitle || '',
    words: s.words || [],
  }))

function grammarTitles(db, steps) {
  const ids = [...new Set(steps.flatMap((s) => parseJson(s.grammar, [])))]
  if (!ids.length) return new Map()
  return new Map(
    db
      .prepare(
        `SELECT id, title FROM library_items WHERE id IN (${ids.map(() => '?').join(',')})`,
      )
      .all(...ids)
      .map((r) => [r.id, r]),
  )
}

/** Full plan: blocks with lessons, and for a student plan — progress. */
function fullPlan(db, plan, access) {
  const blocks = db
    .prepare(
      'SELECT id, title FROM plan_blocks WHERE planId = ? ORDER BY sortOrder, rowid',
    )
    .all(plan.id)
  const steps = planSteps(db, plan.id)
  const titles = grammarTitles(db, steps)
  const issues = new Map(
    db
      .prepare('SELECT * FROM plan_issues WHERE planId = ?')
      .all(plan.id)
      .map((r) => [r.planLessonId, r]),
  )
  // Pending plan lessons take the counted lessons after the passed ones.
  const lessons = plan.studentId ? lessonsFrom(db, plan) : []
  const byId = new Map(lessons.map((l) => [l.id, l]))
  const upcoming = lessons.filter(counts).slice(issuedCount(db, plan.id))
  let pending = 0
  const slot = (l) => (l ? { id: l.id, date: l.date, start: l.start, end: l.end } : null)
  const views = steps.map((step, index) => {
    const issue = issues.get(step.id)
    return {
      id: step.id,
      blockId: step.blockId,
      number: index + 1,
      title: step.title,
      homework: step.homework,
      lexicon: lexiconOf(step),
      grammar: parseJson(step.grammar, [])
        .map((id) => titles.get(id))
        .filter(Boolean),
      files: listFiles(db, 'plan', step.id),
      issue: issue
        ? {
            homeworkId: issue.homeworkId,
            issued: issue.issued,
            lesson: slot(byId.get(issue.lessonId)),
          }
        : null,
      lesson: plan.studentId && !issue ? slot(upcoming[pending++]) : null,
    }
  })
  return {
    id: plan.id,
    title: plan.title,
    authorId: plan.authorId,
    studentId: plan.studentId,
    sourceId: plan.sourceId,
    startDate: plan.startDate,
    updated: plan.updated,
    canEdit: access.edit,
    blocks: blocks.map((b) => ({
      ...b,
      lessons: views.filter((v) => v.blockId === b.id),
    })),
  }
}

function summary(db, plan, access) {
  const steps = planSteps(db, plan.id)
  return {
    id: plan.id,
    title: plan.title,
    authorId: plan.authorId,
    studentId: plan.studentId,
    startDate: plan.startDate,
    updated: plan.updated,
    canEdit: access.edit,
    blockCount: db
      .prepare('SELECT count(*) AS n FROM plan_blocks WHERE planId = ?')
      .get(plan.id).n,
    lessonCount: steps.length,
    passed: Math.min(issuedCount(db, plan.id), steps.length),
  }
}

const touch = (db, planId) =>
  db
    .prepare('UPDATE plans SET updated = ? WHERE id = ?')
    .run(new Date().toISOString(), planId)

/** Removes a plan with its blocks, lessons and their files. */
async function deletePlan(db, store, planId) {
  const files = transaction(db, () => {
    const steps = db
      .prepare('SELECT id FROM plan_lessons WHERE planId = ?')
      .all(planId)
      .map((r) => r.id)
    const ids = dropFileRows(db, 'plan', steps)
    db.prepare('DELETE FROM plan_issues WHERE planId = ?').run(planId)
    db.prepare('DELETE FROM plans WHERE id = ?').run(planId)
    return ids
  })
  await unlinkFiles(store, files)
}

/** Copies a plan (blocks, lessons, files) for a student. */
async function copyPlan(db, store, source, fields) {
  const blocks = db
    .prepare('SELECT * FROM plan_blocks WHERE planId = ? ORDER BY sortOrder, rowid')
    .all(source.id)
  const steps = planSteps(db, source.id)
  const copies = new Map()
  for (const step of steps)
    copies.set(
      step.id,
      await copyStoredFiles(
        store,
        listFiles(db, 'plan', step.id).filter((f) => !f.deleted),
      ),
    )
  const now = new Date().toISOString()
  const id = randomUUID()
  try {
    transaction(db, () => {
      db.prepare(
        `INSERT INTO plans (id, title, authorId, studentId, sourceId, startDate, created, updated)
         VALUES (?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        source.title,
        fields.authorId,
        fields.studentId,
        source.id,
        fields.startDate,
        now,
        now,
      )
      const blockIds = new Map()
      blocks.forEach((b, index) => {
        const blockId = randomUUID()
        blockIds.set(b.id, blockId)
        db.prepare(
          'INSERT INTO plan_blocks (id, planId, title, sortOrder) VALUES (?,?,?,?)',
        ).run(blockId, id, b.title, index)
      })
      for (const step of steps) {
        const stepId = randomUUID()
        db.prepare(
          `INSERT INTO plan_lessons (id, planId, blockId, title, homework, lexicon, grammar, sortOrder)
           VALUES (?,?,?,?,?,?,?,?)`,
        ).run(
          stepId,
          id,
          blockIds.get(step.blockId),
          step.title,
          step.homework,
          step.lexicon,
          step.grammar,
          step.sortOrder,
        )
        for (const file of copies.get(step.id))
          insertFileRow(db, fields.authorId, file, 'plan', stepId, null)
      }
    })
  } catch (error) {
    await unlinkFiles(
      store,
      [...copies.values()].flat().map((f) => f.id),
    )
    throw error
  }
  return id
}

/** Moves a row one place up or down among its siblings. */
function moveAmong(db, table, rows, id, direction) {
  const index = rows.findIndex((r) => r.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= rows.length) return false
  const order = rows.map((r) => r.id)
  ;[order[index], order[target]] = [order[target], order[index]]
  order.forEach((rowId, sortOrder) =>
    db.prepare(`UPDATE ${table} SET sortOrder = ? WHERE id = ?`).run(sortOrder, rowId),
  )
  return true
}

export async function plansRoute({
  path,
  req,
  db,
  user,
  body,
  send,
  getUser,
  store,
  issue,
}) {
  if (
    !path.startsWith('/api/plans') &&
    !path.startsWith('/api/plan-blocks/') &&
    !path.startsWith('/api/plan-lessons/')
  )
    return false
  if (!staff(user)) fail(403, 'Нет доступа')
  const access = (plan) => planAccess(user, getUser, plan)
  const loadPlan = (id, edit = false) => {
    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(id)
    if (!plan || !access(plan).view) fail(404, 'План не найден')
    if (edit && !access(plan).edit) fail(403, 'Нет прав на изменение плана')
    return plan
  }
  const sendPlan = (plan, status = 200, extra = {}) =>
    send(status, { ...fullPlan(db, plan, access(plan)), ...extra })
  const readTitle = (value, fallback = '') => clean(value, MAX_TITLE) || fallback
  const canTeach = (student) =>
    student?.roles.includes('student') &&
    (privileged(user) || student.teacherId === user.id)

  if (path === '/api/plans' && req.method === 'GET') {
    const plans = db
      .prepare('SELECT * FROM plans ORDER BY updated DESC')
      .all()
      .filter((p) => access(p).view)
      .filter((p) => !p.studentId || getUser(p.studentId))
    send(
      200,
      plans.map((p) => summary(db, p, access(p))),
    )
    return true
  }
  if (path === '/api/plans' && req.method === 'POST') {
    const data = await body(req)
    const title = readTitle(data.title)
    if (!title) fail(400, 'Укажите название программы')
    const now = new Date().toISOString()
    const plan = {
      id: randomUUID(),
      title,
      authorId: user.id,
      studentId: null,
      sourceId: '',
      startDate: '',
      created: now,
      updated: now,
    }
    db.prepare(
      `INSERT INTO plans (id, title, authorId, studentId, sourceId, startDate, created, updated)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(...Object.values(plan))
    sendPlan(plan, 201)
    return true
  }
  // Grammar of the whole school: materials of the library section.
  if (path === '/api/plans/grammar' && req.method === 'GET') {
    send(
      200,
      db
        .prepare(
          `SELECT id, title, description FROM library_items
           WHERE category = 'grammar' ORDER BY title COLLATE NOCASE`,
        )
        .all(),
    )
    return true
  }

  const planMatch = /^\/api\/plans\/([^/]+)(?:\/(assign|blocks))?$/.exec(path)
  if (planMatch) {
    const [, id, action] = planMatch
    if (!action && req.method === 'GET') {
      sendPlan(loadPlan(id))
      return true
    }
    if (!action && req.method === 'PATCH') {
      const plan = loadPlan(id, true)
      const data = await body(req)
      const title =
        data.title === undefined ? plan.title : readTitle(data.title)
      if (!title) fail(400, 'Укажите название')
      let startDate = plan.startDate
      if (plan.studentId && data.startDate !== undefined) {
        startDate = clean(data.startDate, 10)
        if (!validDate(startDate)) fail(400, 'Укажите корректную дату начала')
      }
      db.prepare(
        'UPDATE plans SET title = ?, startDate = ?, updated = ? WHERE id = ?',
      ).run(title, startDate, new Date().toISOString(), plan.id)
      if (startDate !== plan.startDate) await issue()
      sendPlan(loadPlan(id))
      return true
    }
    if (!action && req.method === 'DELETE') {
      const plan = loadPlan(id, true)
      await deletePlan(db, store, plan.id)
      send(200, { ok: true })
      return true
    }
    if (action === 'assign' && req.method === 'POST') {
      const source = loadPlan(id)
      const data = await body(req)
      const student = getUser(clean(data.studentId, 64))
      if (!canTeach(student)) fail(403, 'Ученик недоступен')
      const startDate = clean(data.startDate, 10)
      if (!validDate(startDate)) fail(400, 'Укажите дату начала плана')
      const current = db
        .prepare('SELECT * FROM plans WHERE studentId = ?')
        .get(student.id)
      if (current && current.id === source.id)
        fail(400, 'Это план этого же ученика')
      if (current && data.replace !== true)
        fail(409, `У ученика уже есть план «${current.title}»`, {
          existing: { id: current.id, title: current.title },
        })
      if (current) {
        if (!access(current).edit) fail(403, 'Нет прав на изменение плана')
        await deletePlan(db, store, current.id)
      }
      const planId = await copyPlan(db, store, source, {
        authorId: user.id,
        studentId: student.id,
        startDate,
      })
      await issue()
      sendPlan(loadPlan(planId), 201)
      return true
    }
    if (action === 'blocks' && req.method === 'POST') {
      const plan = loadPlan(id, true)
      const data = await body(req)
      const count = db
        .prepare('SELECT count(*) AS n FROM plan_blocks WHERE planId = ?')
        .get(plan.id).n
      if (count >= MAX_BLOCKS) fail(400, `Не больше ${MAX_BLOCKS} блоков`)
      const blockId = randomUUID()
      db.prepare(
        'INSERT INTO plan_blocks (id, planId, title, sortOrder) VALUES (?,?,?,?)',
      ).run(blockId, plan.id, readTitle(data.title, `Блок ${count + 1}`), count)
      touch(db, plan.id)
      sendPlan(plan, 201, { createdId: blockId })
      return true
    }
  }

  const blockMatch = /^\/api\/plan-blocks\/([^/]+)(?:\/(move|lessons))?$/.exec(path)
  if (blockMatch) {
    const [, id, action] = blockMatch
    const block = db.prepare('SELECT * FROM plan_blocks WHERE id = ?').get(id)
    if (!block) fail(404, 'Блок не найден')
    const plan = loadPlan(block.planId, true)
    const data = req.method === 'DELETE' ? {} : await body(req)
    if (!action && req.method === 'PATCH') {
      const title = readTitle(data.title)
      if (!title) fail(400, 'Укажите название блока')
      db.prepare('UPDATE plan_blocks SET title = ? WHERE id = ?').run(title, id)
    } else if (!action && req.method === 'DELETE') {
      const files = transaction(db, () => {
        const steps = db
          .prepare('SELECT id FROM plan_lessons WHERE blockId = ?')
          .all(id)
          .map((r) => r.id)
        const ids = dropFileRows(db, 'plan', steps)
        db.prepare('DELETE FROM plan_blocks WHERE id = ?').run(id)
        return ids
      })
      await unlinkFiles(store, files)
    } else if (action === 'move' && req.method === 'POST') {
      const blocks = db
        .prepare(
          'SELECT id FROM plan_blocks WHERE planId = ? ORDER BY sortOrder, rowid',
        )
        .all(plan.id)
      transaction(db, () =>
        moveAmong(db, 'plan_blocks', blocks, id, data.direction === -1 ? -1 : 1),
      )
    } else if (action === 'lessons' && req.method === 'POST') {
      const total = db
        .prepare('SELECT count(*) AS n FROM plan_lessons WHERE planId = ?')
        .get(plan.id).n
      if (total >= MAX_LESSONS) fail(400, `Не больше ${MAX_LESSONS} уроков в плане`)
      const order = db
        .prepare(
          'SELECT coalesce(max(sortOrder), -1) + 1 AS n FROM plan_lessons WHERE blockId = ?',
        )
        .get(id).n
      const title = readTitle(data.title)
      if (!title) fail(400, 'Укажите название урока')
      const stepId = randomUUID()
      db.prepare(
        'INSERT INTO plan_lessons (id, planId, blockId, title, sortOrder) VALUES (?,?,?,?,?)',
      ).run(stepId, plan.id, id, title, order)
      touch(db, plan.id)
      sendPlan(plan, 201, { createdId: stepId })
      return true
    } else fail(404, 'Не найдено')
    touch(db, plan.id)
    sendPlan(plan)
    return true
  }

  const stepMatch = /^\/api\/plan-lessons\/([^/]+)(?:\/(move))?$/.exec(path)
  if (stepMatch) {
    const [, id, action] = stepMatch
    const step = db.prepare('SELECT * FROM plan_lessons WHERE id = ?').get(id)
    if (!step) fail(404, 'Урок плана не найден')
    const plan = loadPlan(step.planId, req.method !== 'GET')
    if (!action && req.method === 'GET') {
      const view = fullPlan(db, plan, access(plan))
      const lesson = view.blocks
        .flatMap((b) => b.lessons)
        .find((l) => l.id === id)
      send(200, {
        ...lesson,
        plan: {
          id: plan.id,
          title: plan.title,
          studentId: plan.studentId,
          canEdit: view.canEdit,
        },
        block: db.prepare('SELECT title FROM plan_blocks WHERE id = ?').get(step.blockId).title,
      })
      return true
    }
    const data = req.method === 'DELETE' ? {} : await body(req)
    if (!action && req.method === 'PUT') {
      // Only the title is required; everything else may stay empty.
      const title = readTitle(data.title)
      if (!title) fail(400, 'Укажите название урока')
      const homework = clean(data.homework, MAX_TEXT)
      const { sources } = lexiconFromBody(db, data.lexicon)
      const lexicon = sources.map((s) => ({
        kind: s.kind,
        id: s.refId,
        title: s.title,
        parentTitle: s.parentTitle,
        words: s.words.map((w) => ({
          id: w.id,
          term: w.term,
          translation: w.translation,
          transcription: w.transcription,
        })),
      }))
      const grammarIds = Array.isArray(data.grammarIds)
        ? [...new Set(data.grammarIds.filter((g) => typeof g === 'string'))]
        : []
      if (grammarIds.length > MAX_GRAMMAR)
        fail(400, `Не больше ${MAX_GRAMMAR} материалов грамматики`)
      const grammar = existingGrammar(db, grammarIds)
      if (grammar.length !== grammarIds.length)
        fail(400, 'Материал грамматики не найден')
      const remove = Array.isArray(data.removeFileIds)
        ? data.removeFileIds.map(String)
        : []
      const added = Array.isArray(data.fileIds) ? data.fileIds.length : 0
      const files = transaction(db, () => {
        const dropped = dropFileRows(db, 'plan', [id], remove)
        const left = db
          .prepare(`SELECT count(*) AS n FROM files WHERE kind='plan' AND refId=?`)
          .get(id).n
        if (left + added > MAX_FILES)
          fail(400, `Можно приложить до ${MAX_FILES} файлов`)
        attachFiles(db, user, data.fileIds, 'plan', id, null)
        db.prepare(
          'UPDATE plan_lessons SET title = ?, homework = ?, lexicon = ?, grammar = ? WHERE id = ?',
        ).run(title, homework, JSON.stringify(lexicon), JSON.stringify(grammar), id)
        touch(db, plan.id)
        return dropped
      })
      await unlinkFiles(store, files)
      sendPlan(plan)
      return true
    }
    if (!action && req.method === 'DELETE') {
      const files = transaction(db, () => {
        const ids = dropFileRows(db, 'plan', [id])
        db.prepare('DELETE FROM plan_lessons WHERE id = ?').run(id)
        touch(db, plan.id)
        return ids
      })
      await unlinkFiles(store, files)
      sendPlan(plan)
      return true
    }
    if (action === 'move' && req.method === 'POST') {
      const direction = data.direction === -1 ? -1 : 1
      transaction(db, () => {
        const siblings = db
          .prepare(
            'SELECT id FROM plan_lessons WHERE blockId = ? ORDER BY sortOrder, rowid',
          )
          .all(step.blockId)
        if (moveAmong(db, 'plan_lessons', siblings, id, direction)) return
        // At the edge of a block the lesson goes to the neighbouring block.
        const blocks = db
          .prepare(
            'SELECT id FROM plan_blocks WHERE planId = ? ORDER BY sortOrder, rowid',
          )
          .all(plan.id)
        const neighbour = blocks[blocks.findIndex((b) => b.id === step.blockId) + direction]
        if (!neighbour) return
        const edge = db
          .prepare(
            `SELECT ${direction === 1 ? 'coalesce(min(sortOrder), 0) - 1' : 'coalesce(max(sortOrder), -1) + 1'} AS n
             FROM plan_lessons WHERE blockId = ?`,
          )
          .get(neighbour.id).n
        db.prepare(
          'UPDATE plan_lessons SET blockId = ?, sortOrder = ? WHERE id = ?',
        ).run(neighbour.id, edge, id)
      })
      touch(db, plan.id)
      sendPlan(plan)
      return true
    }
  }
  fail(404, 'Не найдено')
}
