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
      email TEXT NOT NULL UNIQUE COLLATE NOCASE, password TEXT NOT NULL,
      roles TEXT NOT NULL, teacherId TEXT REFERENCES users(id), photo TEXT NOT NULL DEFAULT '',
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS lessons (id TEXT PRIMARY KEY, studentId TEXT NOT NULL REFERENCES users(id), teacherId TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, studentId TEXT NOT NULL REFERENCES users(id), senderId TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, created TEXT NOT NULL);
  `)
  return db
}
export function publicUser(row) {
  if (!row) return null
  const { password: _password, archived: _archived, ...user } = row
  return { ...user, roles: JSON.parse(user.roles) }
}
