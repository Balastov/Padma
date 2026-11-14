import { randomInt } from 'node:crypto'

// Preset student avatars served from public/avatars. A user's photo is
// either one of these paths or an uploaded data URL.
export const AVATAR_COUNT = 15
export const PRESET_AVATARS = Array.from(
  { length: AVATAR_COUNT },
  (_, i) => `/avatars/animal-${String(i + 1).padStart(2, '0')}.jpg`,
)
export const isPresetAvatar = (photo) => PRESET_AVATARS.includes(photo)
export const randomAvatar = () => PRESET_AVATARS[randomInt(AVATAR_COUNT)]

/** Uploaded JPG/PNG/WebP up to ~2 MB, a preset avatar or nothing. */
export function photoProblem(photo) {
  if (typeof photo !== 'string') return 'Фото: JPG, PNG или WebP'
  if (!photo || isPresetAvatar(photo)) return ''
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(photo))
    return 'Фото: JPG, PNG или WebP'
  if (photo.length > 2900000) return 'Фото слишком большое'
  return ''
}

/** Students always have an avatar: an empty photo becomes a random one. */
export const studentPhoto = (roles, photo) =>
  !photo && roles.includes('student') ? randomAvatar() : photo

function shuffled(list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Once per database: students without a photo get random avatars, spread
 * evenly over the set. Later removals are handled by studentPhoto.
 */
export function assignStudentAvatars(db) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  )
  const done = db
    .prepare(`SELECT 1 FROM app_meta WHERE key='studentAvatars'`)
    .get()
  if (done) return 0
  const students = db
    .prepare(
      `SELECT id, roles FROM users WHERE (photo IS NULL OR photo='') ORDER BY rowid`,
    )
    .all()
    .filter((u) => JSON.parse(u.roles).includes('student'))
  let deck = []
  db.exec('BEGIN IMMEDIATE')
  try {
    const update = db.prepare('UPDATE users SET photo=? WHERE id=?')
    for (const { id } of students) {
      if (!deck.length) deck = shuffled(PRESET_AVATARS)
      update.run(deck.pop(), id)
    }
    db.prepare(
      `INSERT INTO app_meta (key, value) VALUES ('studentAvatars', ?)`,
    ).run(new Date().toISOString())
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return students.length
}
