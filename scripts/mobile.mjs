import { copyFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
await copyFile(
  new URL('../public/brand/app-icon.png', import.meta.url),
  new URL('../mobile/www/app-icon.png', import.meta.url),
)

const result = spawnSync(
  process.execPath,
  ['node_modules/@capacitor/cli/bin/capacitor', 'sync'],
  { cwd: root, stdio: 'inherit' },
)
if (result.error) throw result.error
process.exitCode = result.status ?? 1
