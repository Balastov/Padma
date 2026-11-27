// Phone numbers in E.164, the same rules as in Quazar (backend/app/core/phone.py).
import { mkdirSync, chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parsePhoneNumberFromString } from 'libphonenumber-js/max'

export const PHONE_INVALID =
  'Неверный номер телефона. Иностранный номер укажите с кодом страны, например +44 7911 123456'
const RU = /^\+7\d{10}$/

/**
 * Any phone → E.164; '' when empty, null when it is not a valid number.
 * Without «+» the number is read as Russian. Numbers +7 are taken by length,
 * as before: accounts already use them, and sign-in must not depend on
 * updates of the numbering data.
 */
export function normalizePhone(value) {
  let raw = typeof value === 'string' ? value.trim() : ''
  let digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('00')) {
    digits = digits.slice(2)
    raw = '+' + digits
  }
  const international = raw.startsWith('+')
  if (international && digits.startsWith('7') && digits.length === 11)
    return '+' + digits
  if (!international) {
    if (digits.length === 11 && /^[78]/.test(digits))
      return '+7' + digits.slice(1)
    if (digits.length === 10) return '+7' + digits
  }
  if (digits.length > 15) return null
  const number = parsePhoneNumberFromString(
    international ? '+' + digits : digits,
    international ? undefined : 'RU',
  )
  if (!number?.isValid()) return null
  const result = number.number
  return result.startsWith('+7') && !RU.test(result) ? null : result
}

/** E.164 shape: a number Quazar already checked is taken as it is. */
export const isE164 = (value) =>
  typeof value === 'string' && /^\+[1-9]\d{7,14}$/.test(value)

/** Stored number that is not in E.164: the administrator fixes it by hand. */
export const phoneNeedsFix = (phone) =>
  Boolean(phone) && normalizePhone(phone) !== phone

/**
 * Once: stored numbers to E.164. Russian ones already are; foreign ones were
 * kept as «+digits» or bare digits and are read with «+». Numbers that do not
 * parse stay as they are and are reported. A backup is made before changes.
 */
export function migratePhones(db, path) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  )
  if (db.prepare(`SELECT 1 FROM app_meta WHERE key='phonesE164'`).get()) return
  const rows = db
    .prepare(`SELECT id, name, surname, phone FROM users WHERE phone != ''`)
    .all()
  const changes = [],
    unparsed = []
  for (const row of rows) {
    if (RU.test(row.phone)) continue
    const next = normalizePhone('+' + row.phone.replace(/\D/g, ''))
    if (!next) unparsed.push(row)
    else if (next !== row.phone) changes.push({ ...row, next })
  }
  if (changes.length && path !== ':memory:') {
    const directory =
      process.env.PADMA_BACKUP_DIR || join(dirname(path), 'backups')
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const backup = join(
      directory,
      'padma-before-phones-' +
        new Date().toISOString().replace(/[:.]/g, '-') +
        '.sqlite',
    )
    db.prepare('VACUUM INTO ?').run(backup)
    chmodSync(backup, 0o600)
    console.log('Резервная копия перед переводом номеров: ' + backup)
  }
  const update = db.prepare('UPDATE users SET phone=? WHERE id=?')
  const taken = db.prepare('SELECT 1 FROM users WHERE phone=? AND id!=?')
  for (const row of changes) {
    if (taken.get(row.next, row.id)) unparsed.push(row)
    else update.run(row.next, row.id)
  }
  for (const row of unparsed)
    console.warn(
      `Номер не переведён в международный формат, исправьте вручную: ${[row.name, row.surname].filter(Boolean).join(' ')} (${row.id})`,
    )
  db.prepare(`INSERT INTO app_meta (key, value) VALUES ('phonesE164', ?)`).run(
    new Date().toISOString(),
  )
}
