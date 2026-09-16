import { randomUUID } from 'node:crypto'
import { privileged, staff } from './store.mjs'

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
  );`)
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
  const detail = (item) => ({
    ...item,
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
    const item = {
      id: randomUUID(),
      studentId: student.id,
      authorId: user.id,
      title,
      description,
      due,
      created: new Date().toISOString(),
    }
    db.prepare('INSERT INTO homework VALUES (?,?,?,?,?,?,?)').run(
      ...Object.values(item),
    )
    send(201, detail(item))
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
