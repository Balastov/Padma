import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore, publicUser } from './store.mjs'
import { isE164, migratePhones, normalizePhone } from './phone.mjs'

test('phones are read as in Quazar and stored in E.164', () => {
  for (const [input, expected] of [
    ['', ''],
    ['  ', ''],
    ['+7 (999) 123-45-67', '+79991234567'],
    ['8 999 123 45 67', '+79991234567'],
    ['79991234567', '+79991234567'],
    ['9991234567', '+79991234567'],
    ['+7 701 234 56 78', '+77012345678'],
    ['+44 7911 123456', '+447911123456'],
    ['0044 7911 123456', '+447911123456'],
    ['+49 170 1234567', '+491701234567'],
    ['+380 50 123 4567', '+380501234567'],
    ['+44 12', null],
    ['+7 999 123', null],
    ['12345', null],
    ['+1234567890123456', null],
  ])
    assert.equal(normalizePhone(input), expected, input)
  assert(isE164('+491701234567'))
  for (const value of ['491701234567', '+0123456789', '+12', 7, null])
    assert(!isE164(value))
})

test('stored numbers move to E.164 once, with a backup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-phones-'))
  const path = join(dir, 'test.sqlite')
  const saved = process.env.PADMA_BACKUP_DIR
  delete process.env.PADMA_BACKUP_DIR
  const warn = console.warn,
    log = console.log
  const warnings = []
  console.warn = (line) => warnings.push(line)
  console.log = () => {}
  try {
    const db = openStore(path)
    const insert = db.prepare(
      `INSERT INTO users (id,name,password,roles,phone) VALUES (?,?,'','["student"]',?)`,
    )
    for (const [id, phone] of [
      ['ru', '+79991234567'],
      ['plus', '+447911123456'],
      ['bare', '491701234567'],
      ['dash', '+49-170-7654321'],
      ['broken', '12345'],
      ['none', ''],
      ['twin', '447911123456'],
    ])
      insert.run(id, id, phone)
    const phoneOf = (id) =>
      db.prepare('SELECT phone FROM users WHERE id=?').get(id).phone
    // The pass on the empty database at start is already recorded.
    migratePhones(db, path)
    assert.equal(phoneOf('bare'), '491701234567')
    db.prepare(`DELETE FROM app_meta WHERE key='phonesE164'`).run()
    migratePhones(db, path)
    assert.equal(phoneOf('ru'), '+79991234567')
    assert.equal(phoneOf('plus'), '+447911123456')
    assert.equal(phoneOf('bare'), '+491701234567')
    assert.equal(phoneOf('dash'), '+491707654321')
    assert.equal(phoneOf('none'), '')
    // Not parsed or already used by another account: left for the administrator.
    assert.equal(phoneOf('broken'), '12345')
    assert.equal(phoneOf('twin'), '447911123456')
    assert.equal(warnings.length, 2)
    assert(warnings.every((line) => !/\d{5}/.test(line.replace(/\(.*\)/, ''))))
    const row = (id) => db.prepare('SELECT * FROM users WHERE id=?').get(id)
    assert.equal(publicUser(row('broken')).phoneNeedsFix, true)
    assert.equal(publicUser(row('bare')).phoneNeedsFix, false)
    assert.equal(publicUser(row('none')).phoneNeedsFix, false)
    const backups = readdirSync(join(dir, 'backups'))
    assert.equal(backups.length, 1)
    assert.match(backups[0], /^padma-before-phones-.+\.sqlite$/)
    // Once only.
    db.prepare(`UPDATE users SET phone='491700000000' WHERE id='none'`).run()
    migratePhones(db, path)
    assert.equal(phoneOf('none'), '491700000000')
    db.close()
  } finally {
    console.warn = warn
    console.log = log
    if (saved === undefined) delete process.env.PADMA_BACKUP_DIR
    else process.env.PADMA_BACKUP_DIR = saved
    rmSync(dir, { recursive: true, force: true })
  }
})
