import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

test('backup captures live WAL data and creates a private consistent snapshot', () => {
  const directory = mkdtempSync(join(tmpdir(), 'padma-backup-'))
  const dbPath = join(directory, 'live.sqlite')
  const backups = join(directory, 'backups')
  const db = new DatabaseSync(dbPath)
  try {
    db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE example (text TEXT); INSERT INTO example VALUES ('saved in WAL')",
    )
    execFileSync(process.execPath, ['scripts/backup.mjs'], {
      env: { ...process.env, PADMA_DB: dbPath, PADMA_BACKUP_DIR: backups },
      stdio: 'pipe',
    })
    const files = readdirSync(backups)
    assert.equal(files.length, 1)
    const path = join(backups, files[0])
    assert.equal(statSync(path).mode & 0o777, 0o600)
    const copy = new DatabaseSync(path, { readOnly: true })
    try {
      assert.equal(
        copy.prepare('SELECT text FROM example').get().text,
        'saved in WAL',
      )
    } finally {
      copy.close()
    }
  } finally {
    db.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
