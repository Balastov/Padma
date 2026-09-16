import { spawn } from 'node:child_process'
const children = [
  spawn(process.execPath, ['--watch', 'server/index.mjs'], {
    stdio: 'inherit',
  }),
  spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'],
    { stdio: 'inherit' },
  ),
]
let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  children.forEach((p) => p.kill('SIGTERM'))
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
children.forEach((p) =>
  p.on('exit', (code) => {
    stop()
    process.exitCode = code || 0
  }),
)
