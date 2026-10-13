import { privileged } from './store.mjs'

// Background image for the Liquid Glass design. One row per teacher plus a
// site-wide 'default' row (set by owner/admin, also shown on the login page).

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status })
}
const DEFAULT = 'default'
const IMAGE_MAX = 5 * 1024 * 1024
const MIMES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/webp': (b) =>
    b.toString('latin1', 0, 4) === 'RIFF' &&
    b.toString('latin1', 8, 12) === 'WEBP',
}
export const BLUR_DEFAULT = 24
export const TINT_DEFAULT = 35

export function initAppearance(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS appearance (
    owner TEXT PRIMARY KEY,
    image BLOB NOT NULL,
    mime TEXT NOT NULL,
    blur INTEGER NOT NULL,
    tint INTEGER NOT NULL,
    updated TEXT NOT NULL,
    updatedBy TEXT NOT NULL
  )`)
}

const isTeacher = (user) => user.roles.includes('teacher')

const meta = (row) =>
  row && {
    url: `/api/appearance/image/${encodeURIComponent(row.owner)}?v=${encodeURIComponent(row.updated)}`,
    blur: row.blur,
    tint: row.tint,
    updated: row.updated,
  }

const rowOf = (db, owner) =>
  db
    .prepare(
      'SELECT owner, mime, blur, tint, updated FROM appearance WHERE owner=?',
    )
    .get(owner)

// Owner whose background the user sees: own (teacher), teacher's (student).
function ownerFor(user) {
  if (isTeacher(user)) return user.id
  if (user.roles.includes('student') && user.teacherId) return user.teacherId
  return null
}

function sendImage(db, res, owner, cache) {
  const row = db
    .prepare('SELECT image, mime FROM appearance WHERE owner=?')
    .get(owner)
  if (!row) fail(404, 'Фон не найден')
  res.writeHead(200, {
    'Content-Type': row.mime,
    'Content-Length': row.image.length,
    'Cache-Control': `${cache}, max-age=31536000, immutable`,
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(Buffer.from(row.image))
}

function parseImage(value) {
  const match =
    typeof value === 'string' &&
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value)
  if (!match) fail(400, 'Фон: JPG, PNG или WebP')
  const data = Buffer.from(match[2], 'base64')
  if (!data.length || data.length > IMAGE_MAX)
    fail(400, 'Фон должен быть не больше 5 МБ')
  if (!MIMES[match[1]](data)) fail(400, 'Файл не похож на изображение')
  return { mime: match[1], data }
}

const level = (value, max, fallback) => {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < 0 || value > max)
    fail(400, 'Некорректные настройки фона')
  return value
}

// Public part: works before login (default background for the login page).
export function appearancePublicRoute({ path, req, res, db, send }) {
  if (path === '/api/appearance/public' && req.method === 'GET') {
    send(200, { active: meta(rowOf(db, DEFAULT)) || null })
    return true
  }
  if (
    path === `/api/appearance/image/${DEFAULT}` &&
    ['GET', 'HEAD'].includes(req.method)
  ) {
    sendImage(db, res, DEFAULT, 'public')
    return true
  }
  return false
}

export async function appearanceRoute({ path, req, res, db, user, body, send }) {
  if (!path.startsWith('/api/appearance')) return false

  if (path === '/api/appearance' && req.method === 'GET') {
    const owner = ownerFor(user)
    const own = owner && rowOf(db, owner)
    const fallback = rowOf(db, DEFAULT)
    send(200, {
      active: meta(own || fallback) || null,
      source: own ? (owner === user.id ? 'mine' : 'teacher') : fallback ? 'default' : null,
      mine: isTeacher(user) ? meta(rowOf(db, user.id)) || null : undefined,
      default: privileged(user) ? meta(fallback) || null : undefined,
      canEditMine: isTeacher(user),
      canEditDefault: privileged(user),
    })
    return true
  }

  const image = /^\/api\/appearance\/image\/([^/]+)$/.exec(path)
  if (image && ['GET', 'HEAD'].includes(req.method)) {
    const owner = decodeURIComponent(image[1])
    if (
      owner !== user.id &&
      owner !== user.teacherId &&
      !privileged(user)
    )
      fail(404, 'Фон не найден')
    sendImage(db, res, owner, 'private')
    return true
  }

  const scope = /^\/api\/appearance\/(mine|default)$/.exec(path)?.[1]
  if (scope && ['PUT', 'DELETE'].includes(req.method)) {
    if (scope === 'mine' && !isTeacher(user))
      fail(403, 'Фон может установить только преподаватель')
    if (scope === 'default' && !privileged(user))
      fail(403, 'Фон по умолчанию может установить только администратор')
    const owner = scope === 'mine' ? user.id : DEFAULT
    if (req.method === 'DELETE') {
      db.prepare('DELETE FROM appearance WHERE owner=?').run(owner)
      send(200, { ok: true })
      return true
    }
    const data = await body(req, 8 * 1024 * 1024)
    const current = db
      .prepare('SELECT image, mime, blur, tint FROM appearance WHERE owner=?')
      .get(owner)
    const file = data.image === undefined ? null : parseImage(data.image)
    if (!file && !current) fail(400, 'Выберите изображение для фона')
    const blur = level(data.blur, 60, current?.blur ?? BLUR_DEFAULT)
    const tint = level(data.tint, 90, current?.tint ?? TINT_DEFAULT)
    const updated = new Date().toISOString()
    db.prepare(
      `INSERT INTO appearance (owner, image, mime, blur, tint, updated, updatedBy)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(owner) DO UPDATE SET image=excluded.image, mime=excluded.mime,
         blur=excluded.blur, tint=excluded.tint, updated=excluded.updated,
         updatedBy=excluded.updatedBy`,
    ).run(
      owner,
      file ? file.data : current.image,
      file ? file.mime : current.mime,
      blur,
      tint,
      updated,
      user.id,
    )
    send(200, meta(rowOf(db, owner)))
    return true
  }

  fail(404, 'Не найдено')
}
