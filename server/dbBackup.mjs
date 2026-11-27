import { chmodSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Copy of the database before a one-time change of data, kept apart from the
 * daily backups (their rotation does not remove it). Returns the file path.
 */
export function backupBefore(db, path, label) {
  if (path === ':memory:') return ''
  const directory =
    process.env.PADMA_BACKUP_DIR || join(dirname(path), 'backups')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const file = join(
    directory,
    `padma-before-${label}-` +
      new Date().toISOString().replace(/[:.]/g, '-') +
      '.sqlite',
  )
  db.prepare('VACUUM INTO ?').run(file)
  chmodSync(file, 0o600)
  return file
}
