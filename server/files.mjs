import { randomUUID } from 'node:crypto'
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  writeFileSync,
} from 'node:fs'
import { rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'

// Attachments live on disk (PADMA_FILES), the database keeps only metadata.
// A file is uploaded first ("pending", owned by the uploader) and then
// attached to a homework, a submission, a chat message or a library item.
// Homework and chat files are removed 30 days after upload; library files
// stay until the material is deleted. The row of a removed file is kept so
// the interface can say the file has expired.

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status })
}
export const MAX_FILE_SIZE = 20 * 1024 * 1024
export const MAX_FILES = 5
export const KEEP_DAYS = 30
const PENDING_HOURS = 24
const MAX_PENDING = 30
// Images, office documents and plain text only: no audio, video or archives.
const TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  csv: 'text/csv',
  txt: 'text/plain',
}
// Shown in the browser; everything else is downloaded.
const INLINE = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'])
const extension = (name) => /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase()
const later = (iso, ms) => new Date(Date.parse(iso) + ms).toISOString()

export function fileName(raw) {
  let name = ''
  try {
    name = decodeURIComponent(String(raw || '')).trim()
  } catch {
    fail(400, 'Некорректное имя файла')
  }
  if (
    !name ||
    name.length > 180 ||
    [...name].some((c) => c.charCodeAt(0) < 32 || c === '/' || c === '\\')
  )
    fail(400, 'Некорректное имя файла')
  if (!TYPES[extension(name)])
    fail(
      400,
      'Можно прикреплять изображения, документы, таблицы, презентации и TXT',
    )
  return name
}

export function initFiles(db, dir) {
  db.exec(`CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL, size INTEGER NOT NULL,
    kind TEXT NOT NULL, refId TEXT NOT NULL DEFAULT '',
    created TEXT NOT NULL, expires TEXT, deleted TEXT
  );
  CREATE INDEX IF NOT EXISTS files_ref ON files(kind, refId);
  CREATE INDEX IF NOT EXISTS files_expires ON files(expires) WHERE deleted IS NULL;`)
  mkdirSync(join(dir, 'tmp'), { recursive: true, mode: 0o700 })
  const store = {
    dir,
    path: (id) => join(dir, id.slice(0, 2), id),
    access: {},
  }
  migrateHomeworkBlobs(db, store)
  return store
}

// Earlier versions kept submission files as BLOBs in SQLite. They move to
// disk once; the 30-day period starts from the move, not from the upload.
function migrateHomeworkBlobs(db, store) {
  const table = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='homework_files'`,
    )
    .get()
  if (!table) return
  const now = new Date().toISOString()
  const rows = db.prepare('SELECT id FROM homework_files').all()
  for (const { id } of rows) {
    const row = db
      .prepare(
        `SELECT f.*, s.homeworkId, h.studentId FROM homework_files f
         JOIN submissions s ON s.id=f.submissionId JOIN homework h ON h.id=s.homeworkId
         WHERE f.id=?`,
      )
      .get(id)
    // A file of a submission that no longer exists has nobody to show it to.
    if (!row) {
      db.prepare('DELETE FROM homework_files WHERE id=?').run(id)
      continue
    }
    const target = store.path(id)
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
    writeFileSync(target, Buffer.from(row.data), { mode: 0o600 })
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(
        'INSERT OR IGNORE INTO files (id,ownerId,name,size,kind,refId,created,expires) VALUES (?,?,?,?,?,?,?,?)',
      ).run(
        id,
        row.studentId,
        row.name,
        row.data.length,
        'submission',
        row.submissionId,
        now,
        later(now, KEEP_DAYS * 864e5),
      )
      db.prepare('DELETE FROM homework_files WHERE id=?').run(id)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  db.exec('DROP TABLE homework_files')
}

/**
 * Attaches the uploader's pending files to an object. `keepDays` null keeps
 * them until the object is removed. Call inside the object's transaction.
 */
export function attachFiles(db, user, ids, kind, refId, keepDays = KEEP_DAYS) {
  if (ids === undefined || ids === null) return []
  if (
    !Array.isArray(ids) ||
    ids.length > MAX_FILES ||
    new Set(ids).size !== ids.length
  )
    fail(400, `Можно приложить до ${MAX_FILES} файлов`)
  return ids.map((id) => {
    const file = db
      .prepare(
        `SELECT * FROM files WHERE id=? AND ownerId=? AND kind='pending' AND deleted IS NULL`,
      )
      .get(String(id), user.id)
    if (!file) fail(400, 'Файл не найден. Загрузите его ещё раз')
    db.prepare('UPDATE files SET kind=?,refId=?,expires=? WHERE id=?').run(
      kind,
      refId,
      keepDays === null ? null : later(file.created, keepDays * 864e5),
      file.id,
    )
    return file
  })
}

export const listFiles = (db, kind, refId) =>
  db
    .prepare(
      'SELECT id,name,size,expires,deleted FROM files WHERE kind=? AND refId=? ORDER BY created,rowid',
    )
    .all(kind, refId)
    .map(({ deleted, ...file }) => ({ ...file, deleted: Boolean(deleted) }))

export async function removeFiles(db, store, kind, refId) {
  const rows = db
    .prepare('SELECT id FROM files WHERE kind=? AND refId=?')
    .all(kind, refId)
  for (const { id } of rows) await unlinkQuiet(store.path(id))
  db.prepare('DELETE FROM files WHERE kind=? AND refId=?').run(kind, refId)
}

async function unlinkQuiet(path) {
  try {
    await unlink(path)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

export async function purgeFiles(db, store, now = new Date()) {
  const stamp = now.toISOString()
  const due = db
    .prepare(
      'SELECT id,kind FROM files WHERE deleted IS NULL AND expires IS NOT NULL AND expires<=?',
    )
    .all(stamp)
  for (const file of due) {
    await unlinkQuiet(store.path(file.id))
    if (file.kind === 'pending')
      db.prepare('DELETE FROM files WHERE id=?').run(file.id)
    else db.prepare('UPDATE files SET deleted=? WHERE id=?').run(stamp, file.id)
  }
  return due.length
}

async function receive(req, target) {
  if (Number(req.headers['content-length']) > MAX_FILE_SIZE)
    fail(413, 'Файл больше 20 МБ')
  let size = 0
  try {
    await pipeline(
      req,
      async function* limit(source) {
        for await (const chunk of source) {
          size += chunk.length
          if (size > MAX_FILE_SIZE) fail(413, 'Файл больше 20 МБ')
          yield chunk
        }
      },
      createWriteStream(target, { flags: 'wx', mode: 0o600 }),
    )
  } catch (error) {
    await unlinkQuiet(target)
    throw error
  }
  return size
}

export async function filesRoute({ path, req, res, db, user, store, send }) {
  if (path === '/api/files' && req.method === 'POST') {
    if (!user.roles.some((r) => r !== 'guest'))
      fail(403, 'Загрузка файлов недоступна')
    const name = fileName(
      new URL(req.url, 'http://localhost').searchParams.get('name'),
    )
    const pending = db
      .prepare(
        `SELECT count(*) AS n FROM files WHERE ownerId=? AND kind='pending'`,
      )
      .get(user.id).n
    if (pending >= MAX_PENDING)
      fail(429, 'Слишком много неотправленных файлов. Повторите позже')
    const id = randomUUID()
    const temp = join(store.dir, 'tmp', id)
    const size = await receive(req, temp)
    if (!size) {
      await unlinkQuiet(temp)
      fail(400, 'Файл пустой')
    }
    const target = store.path(id)
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
    await rename(temp, target)
    const created = new Date().toISOString()
    db.prepare(
      'INSERT INTO files (id,ownerId,name,size,kind,refId,created,expires) VALUES (?,?,?,?,?,?,?,?)',
    ).run(
      id,
      user.id,
      name,
      size,
      'pending',
      '',
      created,
      later(created, PENDING_HOURS * 36e5),
    )
    send(201, { id, name, size, deleted: false })
    return true
  }
  const match = /^\/api\/files\/([^/]+)$/.exec(path)
  if (!match || req.method !== 'GET') return false
  const file = db.prepare('SELECT * FROM files WHERE id=?').get(match[1])
  const allowed =
    file &&
    (file.kind === 'pending'
      ? file.ownerId === user.id
      : store.access[file.kind]?.(user, file.refId))
  if (!allowed) fail(404, 'Файл недоступен')
  if (file.deleted)
    fail(410, `Файл удалён: такие файлы хранятся ${KEEP_DAYS} дней`)
  const ext = extension(file.name)
  const download = new URL(req.url, 'http://localhost').searchParams.has(
    'download',
  )
  const inline = INLINE.has(ext) && !download
  const stream = createReadStream(store.path(file.id))
  await new Promise((resolve, reject) => {
    stream.once('open', resolve)
    stream.once('error', reject)
  }).catch(() => fail(410, 'Файл удалён'))
  res.writeHead(200, {
    'Content-Type': inline ? TYPES[ext] : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="file.${ext}"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`,
    'Content-Length': file.size,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    // The built-in PDF viewer does not run in a sandboxed document.
    ...(inline && ext === 'pdf'
      ? {}
      : {
          'Content-Security-Policy':
            "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        }),
  })
  await pipeline(stream, res)
  return true
}
