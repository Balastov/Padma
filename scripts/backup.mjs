import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, chmodSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const directory = process.env.PADMA_BACKUP_DIR || '/var/lib/padma/backups'
const dbPath = process.env.PADMA_DB
if (!dbPath) throw new Error('PADMA_DB is required')
mkdirSync(directory, { recursive: true, mode: 0o700 })
const filename =
  'padma-' + new Date().toISOString().replace(/[:.]/g, '-') + '.sqlite'
const destination = join(directory, filename)
const db = new DatabaseSync(dbPath, { readOnly: true })
try {
  db.prepare('VACUUM INTO ?').run(destination)
} finally {
  db.close()
}
chmodSync(destination, 0o600)
const copy = new DatabaseSync(destination, { readOnly: true })
try {
  if (copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
    throw new Error('Backup integrity check failed')
} finally {
  copy.close()
}
const backups = readdirSync(directory)
  .filter((name) => /^padma-\d{4}-\d{2}-\d{2}T[\d-]+Z\.sqlite$/.test(name))
  .sort()
  .reverse()
for (const old of backups.slice(14)) unlinkSync(join(directory, old))
console.log('Padma backup created and verified: ' + filename)
