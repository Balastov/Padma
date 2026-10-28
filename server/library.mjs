import { randomUUID } from 'node:crypto'
import { privileged, staff } from './store.mjs'
import { attachFiles, listFiles, removeFiles } from './files.mjs'

// Library materials: one file each, kept until the material is deleted.
// Audience "all": every student of the author (of the whole school when the
// author is an owner or administrator); "selected": the listed students.

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status })
}
const clean = (value, max) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

export function initLibrary(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS library_items (
    id TEXT PRIMARY KEY, authorId TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    audience TEXT NOT NULL DEFAULT 'all', created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS library_students (
    itemId TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
    studentId TEXT NOT NULL REFERENCES users(id),
    PRIMARY KEY (itemId, studentId)
  );`)
}

const studentsOf = (db, itemId) =>
  db
    .prepare('SELECT studentId FROM library_students WHERE itemId=?')
    .all(itemId)
    .map((r) => r.studentId)
const canManage = (user, item) => privileged(user) || item.authorId === user.id

export function canSeeLibraryItem(db, user, getUser, itemId) {
  const item = db.prepare('SELECT * FROM library_items WHERE id=?').get(itemId)
  if (!item) return false
  if (canManage(user, item)) return true
  if (!user.roles.includes('student')) return false
  if (item.audience === 'selected')
    return studentsOf(db, item.id).includes(user.id)
  const author = getUser(item.authorId)
  return Boolean(author && (privileged(author) || user.teacherId === author.id))
}

export async function libraryRoute({
  path,
  req,
  db,
  user,
  body,
  send,
  getUser,
  store,
}) {
  if (!path.startsWith('/api/library')) return false
  const view = (item) => ({
    ...item,
    file: listFiles(db, 'library', item.id)[0] || null,
    ...(canManage(user, item) && { studentIds: studentsOf(db, item.id) }),
  })
  if (path === '/api/library' && req.method === 'GET') {
    const items = db
      .prepare('SELECT * FROM library_items ORDER BY created DESC, rowid DESC')
      .all()
      .filter((item) =>
        staff(user)
          ? canManage(user, item)
          : canSeeLibraryItem(db, user, getUser, item.id),
      )
    send(200, items.map(view))
    return true
  }
  if (path === '/api/library' && req.method === 'POST') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const data = await body(req)
    const title = clean(data.title, 200),
      description = clean(data.description, 2000)
    if (!title) fail(400, 'Укажите название материала')
    if (typeof data.fileId !== 'string') fail(400, 'Прикрепите файл')
    if (!['all', 'selected'].includes(data.audience))
      fail(400, 'Выберите, кому доступен материал')
    const studentIds =
      data.audience === 'selected' && Array.isArray(data.studentIds)
        ? [...new Set(data.studentIds.map(String))]
        : []
    if (data.audience === 'selected' && !studentIds.length)
      fail(400, 'Выберите учеников')
    for (const id of studentIds) {
      const student = getUser(id)
      if (
        !student?.roles.includes('student') ||
        !(privileged(user) || student.teacherId === user.id)
      )
        fail(403, 'Ученик недоступен')
    }
    const item = {
      id: randomUUID(),
      authorId: user.id,
      title,
      description,
      audience: data.audience,
      created: new Date().toISOString(),
    }
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(
        'INSERT INTO library_items (id,authorId,title,description,audience,created) VALUES (?,?,?,?,?,?)',
      ).run(...Object.values(item))
      for (const id of studentIds)
        db.prepare(
          'INSERT INTO library_students (itemId,studentId) VALUES (?,?)',
        ).run(item.id, id)
      attachFiles(db, user, [data.fileId], 'library', item.id, null)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    send(201, view(item))
    return true
  }
  const match = /^\/api\/library\/([^/]+)$/.exec(path)
  if (match && req.method === 'DELETE') {
    const item = db
      .prepare('SELECT * FROM library_items WHERE id=?')
      .get(match[1])
    if (!item) fail(404, 'Материал не найден')
    if (!canManage(user, item)) fail(403, 'Нет доступа')
    await removeFiles(db, store, 'library', item.id)
    db.prepare('DELETE FROM library_items WHERE id=?').run(item.id)
    send(200, { ok: true })
    return true
  }
  fail(404, 'Не найдено')
}
