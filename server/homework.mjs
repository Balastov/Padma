import { randomUUID } from 'node:crypto'
import { privileged, staff } from './store.mjs'
import { topicTerms, subtopicTerms } from './lexicon.mjs'
import {
  MAX_FILES,
  attachFiles,
  dropFileRows,
  listFiles,
  unlinkFiles,
} from './files.mjs'
import { localDay } from './timezone.mjs'

/** Completed homework is deleted for good this many days after review. */
export const DONE_KEEP_DAYS = 30

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status })
}
const clean = (value, max) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''
export function initHomework(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS homework (
    id TEXT PRIMARY KEY, studentId TEXT NOT NULL REFERENCES users(id), authorId TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL, description TEXT NOT NULL, due TEXT NOT NULL, created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY, homeworkId TEXT NOT NULL REFERENCES homework(id), text TEXT NOT NULL, created TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted', comment TEXT NOT NULL DEFAULT '', reviewerId TEXT REFERENCES users(id), reviewed TEXT
  );
  CREATE TABLE IF NOT EXISTS homework_lexicon_sources (
    id INTEGER PRIMARY KEY, homeworkId TEXT NOT NULL REFERENCES homework(id),
    kind TEXT NOT NULL, refId TEXT NOT NULL DEFAULT '', title TEXT NOT NULL,
    parentTitle TEXT NOT NULL DEFAULT '', sortOrder INTEGER NOT NULL DEFAULT 0
  );
  -- Word snapshot: assigned homework stays readable after dictionary edits.
  CREATE TABLE IF NOT EXISTS homework_terms (
    homeworkId TEXT NOT NULL REFERENCES homework(id), termId TEXT NOT NULL,
    term TEXT NOT NULL, translation TEXT NOT NULL DEFAULT '', transcription TEXT NOT NULL DEFAULT '',
    sourceId INTEGER REFERENCES homework_lexicon_sources(id), sortOrder INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (homeworkId, termId)
  );
  CREATE INDEX IF NOT EXISTS homework_lexicon_sources_hw ON homework_lexicon_sources(homeworkId);`)
  const columns = db.prepare('PRAGMA table_info(homework)').all()
  if (!columns.some((c) => c.name === 'archived'))
    db.exec(
      'ALTER TABLE homework ADD COLUMN archived INTEGER NOT NULL DEFAULT 0',
    )
}
const lastSubmission = (db, homeworkId) =>
  db
    .prepare(
      'SELECT * FROM submissions WHERE homeworkId=? ORDER BY created DESC,rowid DESC LIMIT 1',
    )
    .get(homeworkId)
/**
 * assigned — on the student's side (new or returned for revision),
 * review — sent to the teacher, done — marked completed,
 * overdue — still on the student's side after the Moscow due date.
 */
export function homeworkStatus(item, last, today = localDay(new Date())) {
  if (last?.status === 'submitted') return 'review'
  if (last?.status === 'accepted') return 'done'
  return item.due && item.due < today ? 'overdue' : 'assigned'
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
/** Removes homework with answers, words and files. Cannot be undone. */
export async function deleteHomework(db, store, id) {
  const files = transaction(db, () => {
    const submissions = db
      .prepare('SELECT id FROM submissions WHERE homeworkId=?')
      .all(id)
      .map((s) => s.id)
    const ids = [
      ...dropFileRows(db, 'homework', [id]),
      ...dropFileRows(db, 'submission', submissions),
    ]
    db.prepare('DELETE FROM homework_terms WHERE homeworkId=?').run(id)
    db.prepare('DELETE FROM homework_lexicon_sources WHERE homeworkId=?').run(
      id,
    )
    db.prepare('DELETE FROM submissions WHERE homeworkId=?').run(id)
    db.prepare('DELETE FROM homework WHERE id=?').run(id)
    return ids
  })
  await unlinkFiles(store, files)
}
/** Deletes homework completed more than DONE_KEEP_DAYS ago. */
export async function purgeDoneHomework(db, store, now = new Date()) {
  const border = new Date(now.getTime() - DONE_KEEP_DAYS * 864e5).toISOString()
  const due = db
    .prepare('SELECT id FROM homework')
    .all()
    .filter(({ id }) => {
      const last = lastSubmission(db, id)
      return (
        last?.status === 'accepted' && last.reviewed && last.reviewed <= border
      )
    })
  for (const { id } of due) await deleteHomework(db, store, id)
  return due.length
}

const LEXICON_KINDS = { topic: 'Тема', subtopic: 'Подтема', search: 'Поиск по словарю' }

// [{ kind, id?, termIds }] -> sources with validated, de-duplicated words.
function lexiconFromBody(db, raw) {
  if (raw === undefined || raw === null) return { sources: [], duplicates: 0 }
  if (!Array.isArray(raw) || raw.length > 30)
    fail(400, 'Некорректный набор лексики')
  const seen = new Set()
  const sources = []
  let duplicates = 0
  for (const item of raw) {
    const kind = item?.kind
    if (!Object.hasOwn(LEXICON_KINDS, kind))
      fail(400, 'Этот источник лексики пока недоступен')
    const ids = Array.isArray(item.termIds)
      ? item.termIds.filter((id) => typeof id === 'string')
      : []
    if (ids.length > 1000) fail(400, 'Слишком много слов в одном источнике')
    if (!ids.length) continue
    let allowed
    let title = LEXICON_KINDS.search
    let parentTitle = ''
    let refId = ''
    if (kind === 'topic') {
      const topic = db
        .prepare('SELECT id, title FROM vocab_topics WHERE id=? AND archived=0')
        .get(clean(item.id, 64))
      if (!topic) fail(400, 'Тема не найдена')
      allowed = topicTerms(db, topic.id)
      ;({ title, id: refId } = topic)
    } else if (kind === 'subtopic') {
      const sub = db
        .prepare(
          `SELECT s.id, s.title, t.title AS topicTitle FROM vocab_subtopics s
           JOIN vocab_topics t ON t.id = s.topicId
           WHERE s.id=? AND s.archived=0 AND t.archived=0`,
        )
        .get(clean(item.id, 64))
      if (!sub) fail(400, 'Подтема не найдена')
      allowed = subtopicTerms(db, sub.id)
      ;({ title, id: refId, topicTitle: parentTitle } = sub)
    } else {
      const unique = [...new Set(ids)]
      allowed = db
        .prepare(
          `SELECT id, term, translation, transcription FROM lexicon_terms
           WHERE id IN (${unique.map(() => '?').join(',')})`,
        )
        .all(...unique)
    }
    const byId = new Map(allowed.map((t) => [t.id, t]))
    const words = []
    for (const id of ids) {
      const word = byId.get(id)
      if (!word) fail(400, `Слово не относится к источнику «${title}»`)
      if (seen.has(id)) {
        duplicates++
        continue
      }
      seen.add(id)
      words.push(word)
    }
    if (words.length) sources.push({ kind, refId, title, parentTitle, words })
  }
  if (seen.size > 2000) fail(400, 'В задании не может быть больше 2000 слов')
  return { sources, duplicates }
}
const canReadStudent = (user, student) =>
  student?.roles.includes('student') &&
  (privileged(user) ||
    student.id === user.id ||
    (staff(user) && student.teacherId === user.id))
/** File access: task files by homework id, answer files by submission id. */
export function canReadHomework(db, user, getUser, { homeworkId, submissionId }) {
  const item = db
    .prepare(
      homeworkId
        ? 'SELECT studentId,archived FROM homework WHERE id=?'
        : 'SELECT h.studentId,h.archived FROM homework h JOIN submissions s ON s.homeworkId=h.id WHERE s.id=?',
    )
    .get(homeworkId || submissionId)
  return Boolean(
    item &&
    !(item.archived && user.id === item.studentId) &&
    canReadStudent(user, getUser(item.studentId)),
  )
}
export async function homeworkRoute({
  path,
  req,
  db,
  user,
  body,
  send,
  getUser,
  store,
}) {
  if (!path.startsWith('/api/homework')) return false
  const canRead = (student) => canReadStudent(user, student)
  const canManage = (student) =>
    staff(user) && (privileged(user) || student?.teacherId === user.id)
  // Archived homework is visible only to those who manage it.
  const visible = (item) => {
    const student = getUser(item.studentId)
    return canRead(student) && (!item.archived || canManage(student))
  }
  const accessible = (id) => {
    const item = db.prepare('SELECT * FROM homework WHERE id=?').get(id)
    if (!item || !visible(item)) fail(404, 'Задание недоступно')
    return item
  }
  const manageable = (id) => {
    const item = accessible(id)
    if (!canManage(getUser(item.studentId)) || user.id === item.studentId)
      fail(403, 'Нет доступа к заданию')
    return item
  }
  const readTask = (data) => {
    const title = clean(data.title, 200),
      description = clean(data.description, 10000),
      due = clean(data.due, 10)
    if (!title || !description) fail(400, 'Укажите название и описание задания')
    if (
      due &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(due) ||
        isNaN(Date.parse(due)) ||
        new Date(due).toISOString().slice(0, 10) !== due)
    )
      fail(400, 'Некорректный срок сдачи')
    return { title, description, due }
  }
  const lexicon = (homeworkId) => {
    const sources = db
      .prepare(
        `SELECT s.id, s.kind, s.title, s.parentTitle, count(t.termId) AS count
         FROM homework_lexicon_sources s
         LEFT JOIN homework_terms t ON t.sourceId = s.id
         WHERE s.homeworkId=? GROUP BY s.id ORDER BY s.sortOrder`,
      )
      .all(homeworkId)
    const words = db
      .prepare(
        `SELECT termId AS id, term, translation, transcription, sourceId
         FROM homework_terms WHERE homeworkId=? ORDER BY sortOrder`,
      )
      .all(homeworkId)
    return { sources, words }
  }
  const today = localDay(new Date())
  const detail = (item) => ({
    ...item,
    archived: Boolean(item.archived),
    status: homeworkStatus(item, lastSubmission(db, item.id), today),
    canManage: canManage(getUser(item.studentId)) && user.id !== item.studentId,
    files: listFiles(db, 'homework', item.id),
    lexicon: lexicon(item.id),
    submissions: db
      .prepare(
        'SELECT * FROM submissions WHERE homeworkId=? ORDER BY created,rowid',
      )
      .all(item.id)
      .map((s) => ({ ...s, files: listFiles(db, 'submission', s.id) })),
  })
  if (path === '/api/homework' && req.method === 'GET') {
    send(
      200,
      db
        .prepare('SELECT * FROM homework ORDER BY created DESC,id')
        .all()
        .filter(visible)
        .map(detail),
    )
    return true
  }
  if (path === '/api/homework' && req.method === 'POST') {
    const data = await body(req),
      student = getUser(data.studentId)
    if (!student?.roles.includes('student') || !canManage(student))
      fail(403, 'Ученик недоступен')
    const { title, description, due } = readTask(data)
    const { sources, duplicates } = lexiconFromBody(db, data.lexicon)
    const item = {
      id: randomUUID(),
      studentId: student.id,
      authorId: user.id,
      title,
      description,
      due,
      created: new Date().toISOString(),
    }
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(
        'INSERT INTO homework (id,studentId,authorId,title,description,due,created) VALUES (?,?,?,?,?,?,?)',
      ).run(...Object.values(item))
      attachFiles(db, user, data.fileIds, 'homework', item.id)
      const insertSource = db.prepare(
        `INSERT INTO homework_lexicon_sources
         (homeworkId, kind, refId, title, parentTitle, sortOrder) VALUES (?,?,?,?,?,?)`,
      )
      const insertTerm = db.prepare(
        `INSERT INTO homework_terms
         (homeworkId, termId, term, translation, transcription, sourceId, sortOrder)
         VALUES (?,?,?,?,?,?,?)`,
      )
      let order = 0
      sources.forEach((source, index) => {
        const sourceId = insertSource.run(
          item.id,
          source.kind,
          source.refId,
          source.title,
          source.parentTitle,
          index,
        ).lastInsertRowid
        for (const w of source.words)
          insertTerm.run(
            item.id,
            w.id,
            w.term,
            w.translation,
            w.transcription,
            sourceId,
            order++,
          )
      })
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    send(201, { ...detail(item), duplicatesSkipped: duplicates })
    return true
  }
  const submit = /^\/api\/homework\/([^/]+)\/submit$/.exec(path)
  if (submit && req.method === 'POST') {
    const item = accessible(submit[1])
    if (user.id !== item.studentId)
      fail(403, 'Отправить работу может только ученик')
    const data = await body(req),
      answer = clean(data.text, 10000),
      fileIds = Array.isArray(data.fileIds) ? data.fileIds : []
    if (!answer && !fileIds.length)
      fail(400, 'Напишите ответ или приложите файл')
    const last = lastSubmission(db, item.id)
    if (last && last.status !== 'returned')
      fail(409, 'Работа уже отправлена или принята')
    const id = randomUUID()
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(
        'INSERT INTO submissions (id,homeworkId,text,created) VALUES (?,?,?,?)',
      ).run(id, item.id, answer, new Date().toISOString())
      attachFiles(db, user, fileIds, 'submission', id)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    send(201, detail(item))
    return true
  }
  const review = /^\/api\/homework\/([^/]+)\/review$/.exec(path)
  if (review && req.method === 'POST') {
    const item = accessible(review[1])
    if (!canManage(getUser(item.studentId)) || user.id === item.studentId)
      fail(403, 'Нет доступа к проверке')
    const data = await body(req),
      comment = clean(data.comment, 10000)
    if (
      !['accepted', 'returned'].includes(data.status) ||
      (data.status === 'returned' && !comment)
    )
      fail(400, 'Для доработки нужен комментарий')
    if (item.archived) fail(409, 'Задание в архиве')
    const last = lastSubmission(db, item.id)
    if (!last || last.id !== data.submissionId || last.status !== 'submitted')
      fail(409, 'Эта версия уже проверена. Обновите список.')
    db.prepare(
      'UPDATE submissions SET status=?,comment=?,reviewerId=?,reviewed=? WHERE id=?',
    ).run(data.status, comment, user.id, new Date().toISOString(), last.id)
    send(200, detail(item))
    return true
  }
  const archive = /^\/api\/homework\/([^/]+)\/archive$/.exec(path)
  if (archive && req.method === 'POST') {
    const item = manageable(archive[1])
    const data = await body(req)
    if (typeof data.archived !== 'boolean') fail(400, 'Укажите действие')
    db.prepare('UPDATE homework SET archived=? WHERE id=?').run(
      data.archived ? 1 : 0,
      item.id,
    )
    send(200, detail({ ...item, archived: data.archived ? 1 : 0 }))
    return true
  }
  const one = /^\/api\/homework\/([^/]+)$/.exec(path)
  if (one && req.method === 'PATCH') {
    const item = manageable(one[1])
    const data = await body(req)
    const task = readTask(data)
    const remove = Array.isArray(data.removeFileIds)
      ? data.removeFileIds.map(String)
      : []
    const added = Array.isArray(data.fileIds) ? data.fileIds.length : 0
    const files = transaction(db, () => {
      const dropped = dropFileRows(db, 'homework', [item.id], remove)
      const left = db
        .prepare(
          `SELECT count(*) AS n FROM files WHERE kind='homework' AND refId=?`,
        )
        .get(item.id).n
      if (left + added > MAX_FILES)
        fail(400, `Можно приложить до ${MAX_FILES} файлов`)
      attachFiles(db, user, data.fileIds, 'homework', item.id)
      db.prepare(
        'UPDATE homework SET title=?,description=?,due=? WHERE id=?',
      ).run(task.title, task.description, task.due, item.id)
      return dropped
    })
    await unlinkFiles(store, files)
    send(200, detail({ ...item, ...task }))
    return true
  }
  if (one && req.method === 'DELETE') {
    const item = manageable(one[1])
    await deleteHomework(db, store, item.id)
    send(200, { ok: true })
    return true
  }
  fail(404, 'Не найдено')
}
