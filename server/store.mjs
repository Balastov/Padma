import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
export const ROLES = ['owner', 'admin', 'teacher', 'student', 'guest']
export const privileged = (user) =>
  user.roles.some((role) => ['owner', 'admin'].includes(role))
export const staff = (user) =>
  privileged(user) || user.roles.includes('teacher')
export const tokenHash = (token) =>
  createHash('sha256').update(token).digest('hex')
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const key = await scrypt(password, salt, 64)
  return `${salt}:${key.toString('hex')}`
}
export async function verifyPassword(password, hash) {
  const [salt, digest] = hash.split(':')
  const key = await scrypt(password, salt, 64)
  return timingSafeEqual(key, Buffer.from(digest, 'hex'))
}
export function openStore(path) {
  if (path !== ':memory:')
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(path)
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, surname TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '' COLLATE NOCASE, password TEXT NOT NULL,
      roles TEXT NOT NULL, teacherId TEXT REFERENCES users(id), photo TEXT NOT NULL DEFAULT '',
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS lessons (id TEXT PRIMARY KEY, studentId TEXT NOT NULL REFERENCES users(id), teacherId TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, studentId TEXT NOT NULL REFERENCES users(id), senderId TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, created TEXT NOT NULL);
  `)
  const columns = db.prepare('PRAGMA table_info(users)').all()
  if (!columns.some((column) => column.name === 'phone'))
    db.exec(`ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''`)
  migrateEmailUniqueness(db)
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
     ON users(email COLLATE NOCASE) WHERE email != ''`,
  )
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique
     ON users(phone) WHERE phone != ''`,
  )
  return db
}
function migrateEmailUniqueness(db) {
  const row = db
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`,
    )
    .get()
  const createSql = row?.sql || ''
  // Old schema had a table-level UNIQUE on email, which blocks several empty emails.
  if (!/email[^,\n]*\bUNIQUE\b/i.test(createSql)) return
  db.exec('PRAGMA foreign_keys=OFF')
  db.exec(`
    BEGIN;
    CREATE TABLE users_mig (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      surname TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
      password TEXT NOT NULL,
      roles TEXT NOT NULL,
      teacherId TEXT,
      photo TEXT NOT NULL DEFAULT '',
      archived INTEGER NOT NULL DEFAULT 0,
      phone TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO users_mig (
      id, name, surname, email, password, roles, teacherId, photo, archived, phone
    )
    SELECT
      id, name, surname, email, password, roles, teacherId, photo, archived,
      COALESCE(phone, '')
    FROM users;
    DROP TABLE users;
    ALTER TABLE users_mig RENAME TO users;
    COMMIT;
  `)
  db.exec('PRAGMA foreign_keys=ON')
}
/** Normalize phone for storage and login. RU uses last 10 digits. */
export function normalizePhone(value, foreign = false) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return ''
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  if (foreign) return hasPlus ? `+${digits}` : digits
  const national = digits.slice(-10)
  const looksRu =
    (digits.startsWith('7') && digits.length >= 11) ||
    (digits.startsWith('8') && digits.length >= 11) ||
    (digits.length === 10 && digits.startsWith('9')) ||
    (hasPlus && digits.startsWith('7')) ||
    (!hasPlus && digits.startsWith('9'))
  if (!looksRu && hasPlus) return `+${digits}`
  if (!looksRu) return digits
  return national ? `+7${national}` : ''
}
export function isCompleteRuPhone(value) {
  return /^\+79\d{9}$/.test(normalizePhone(value, false))
}
export function isValidForeignPhone(value) {
  const normalized = normalizePhone(value, true)
  return /^\+?\d{8,15}$/.test(normalized)
}
export function publicUser(row) {
  if (!row) return null
  const { password: _password, archived: _archived, ...user } = row
  return { ...user, roles: JSON.parse(user.roles) }
}
