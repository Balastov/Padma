import { randomUUID } from 'node:crypto'
import { privileged, staff } from './store.mjs'
import { topicTerms, subtopicTerms } from './lexicon.mjs'

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
  CREATE TABLE IF NOT EXISTS homework_files (
    id TEXT PRIMARY KEY, submissionId TEXT NOT NULL REFERENCES submissions(id), name TEXT NOT NULL, data BLOB NOT NULL
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
export async function homeworkRoute({
  path,
  req,
  res,
  db,
  user,
  body,
  send,
  getUser,
}) {
  if (!path.startsWith('/api/homework')) return false
  const canRead = (student) =>
    student?.roles.includes('student') &&
    (privileged(user) ||
      student.id === user.id ||
      (staff(user) && student.teacherId === user.id))
  const canManage = (student) =>
    staff(user) && (privileged(user) || student?.teacherId === user.id)
  const accessible = (id) => {
    const item = db.prepare('SELECT * FROM homework WHERE id=?').get(id)
    if (!item || !canRead(getUser(item.studentId)))
      fail(404, 'Задание недоступно')
    return item
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
  const detail = (item) => ({
    ...item,
    lexicon: lexicon(item.id),
    submissions: db
      .prepare(
        'SELECT * FROM submissions WHERE homeworkId=? ORDER BY created,rowid',
      )
      .all(item.id)
      .map((s) => ({
        ...s,
        files: db
          .prepare(
            'SELECT id,name,length(data) AS size FROM homework_files WHERE submissionId=?',
          )
          .all(s.id),
      })),
  })
  if (path === '/api/homework' && req.method === 'GET') {
    send(
      200,
      db
        .prepare('SELECT * FROM homework ORDER BY created DESC,id')
        .all()
        .filter((h) => canRead(getUser(h.studentId)))
        .map(detail),
    )
    return true
  }
  if (path === '/api/homework' && req.method === 'POST') {
    const data = await body(req),
      student = getUser(data.studentId)
    if (!student?.roles.includes('student') || !canManage(student))
      fail(403, 'Ученик недоступен')
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
      db.prepare('INSERT INTO homework VALUES (?,?,?,?,?,?,?)').run(
        ...Object.values(item),
      )
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
    const data = await body(req, 15000000),
      answer = clean(data.text, 10000)
    if (!Array.isArray(data.files) || data.files.length > 5)
      fail(400, 'Можно приложить до 5 файлов')
    let total = 0
    const files = data.files.map((f) => {
      const name = clean(f?.name, 180)
      if (
        !name ||
        !/\.(pdf|doc|docx|jpg|jpeg|png)$/i.test(name) ||
        [...name].some(
          (c) => c.charCodeAt(0) < 32 || c === '/' || c === '\\',
        ) ||
        typeof f.data !== 'string' ||
        /[^A-Za-z0-9+/=]/.test(f.data)
      )
        fail(400, 'Допустимы PDF, DOC, DOCX, JPG и PNG')
      const content = Buffer.from(f.data, 'base64')
      if (content.toString('base64') !== f.data) fail(400, 'Некорректный файл')
      total += content.length
      if (!content.length || total > 10 * 1024 * 1024)
        fail(400, 'Файлы должны быть непустыми, общий размер — до 10 МБ')
      return { id: randomUUID(), name, content }
    })
    if (!answer && !files.length) fail(400, 'Напишите ответ или приложите файл')
    // Recheck state after reading the upload, so concurrent submissions cannot bypass it.
    const last = db
      .prepare(
        'SELECT status FROM submissions WHERE homeworkId=? ORDER BY created DESC,rowid DESC LIMIT 1',
      )
      .get(item.id)
    if (last && last.status !== 'returned')
      fail(409, 'Работа уже отправлена или принята')
    const id = randomUUID()
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(
        'INSERT INTO submissions (id,homeworkId,text,created) VALUES (?,?,?,?)',
      ).run(id, item.id, answer, new Date().toISOString())
      for (const f of files)
        db.prepare('INSERT INTO homework_files VALUES (?,?,?,?)').run(
          f.id,
          id,
          f.name,
          f.content,
        )
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
    const last = db
      .prepare(
        'SELECT * FROM submissions WHERE homeworkId=? ORDER BY created DESC,rowid DESC LIMIT 1',
      )
      .get(item.id)
    if (!last || last.id !== data.submissionId || last.status !== 'submitted')
      fail(409, 'Эта версия уже проверена. Обновите список.')
    db.prepare(
      'UPDATE submissions SET status=?,comment=?,reviewerId=?,reviewed=? WHERE id=?',
    ).run(data.status, comment, user.id, new Date().toISOString(), last.id)
    send(200, detail(item))
    return true
  }
  const download = /^\/api\/homework\/files\/([^/]+)$/.exec(path)
  if (download && req.method === 'GET') {
    const file = db
      .prepare(
        'SELECT f.*,s.homeworkId FROM homework_files f JOIN submissions s ON s.id=f.submissionId WHERE f.id=?',
      )
      .get(download[1])
    if (!file) fail(404, 'Файл недоступен')
    accessible(file.homeworkId)
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="homework-file"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': file.data.length,
    })
    res.end(Buffer.from(file.data))
    return true
  }
  fail(404, 'Не найдено')
}
