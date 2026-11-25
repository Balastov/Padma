// Server rescue when Quazar is unavailable: unlink Quazar from an account found
// by phone or email and set a new password (typed twice, never shown).
// On the server (see DEPLOY.md):
//   cd /var/www/padma/current
//   sudo -u padma env PADMA_DB=/var/lib/padma/padma.sqlite \
//     /opt/padma/node/bin/node server/quazarUnlink.mjs +79991234567
import { createInterface } from 'node:readline'
import { hashPassword, normalizePhone, openStore } from './store.mjs'
import { initQuazar, unlinkQuazar } from './quazar.mjs'

const login = (process.argv[2] || '').trim()
if (!login) {
  console.error('Укажите телефон или email пользователя')
  process.exit(1)
}
const db = openStore(process.env.PADMA_DB || '.data/padma.sqlite')
initQuazar(db)
const user = login.includes('@')
  ? db
      .prepare('SELECT * FROM users WHERE email=? AND archived=0')
      .get(login.toLowerCase())
  : db
      .prepare('SELECT * FROM users WHERE phone=? AND archived=0')
      .get(normalizePhone(login))
if (!user) {
  console.error('Пользователь не найден')
  process.exit(1)
}
if (!user.quazarId) {
  console.error('Квазар у этого пользователя не привязан')
  process.exit(1)
}

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: Boolean(process.stdin.isTTY),
})
let muted = false
// Typed characters are not echoed while the password is entered.
rl._writeToOutput = (text) => {
  if (!muted) rl.output.write(text)
}
const lines = rl[Symbol.asyncIterator]()
async function askHidden(question) {
  rl.output.write(question)
  muted = true
  const { value = '' } = await lines.next()
  muted = false
  rl.output.write('\n')
  return value
}

const name = [user.name, user.surname].filter(Boolean).join(' ')
console.log(`Пользователь: ${name}`)
const password = await askHidden('Новый пароль (от 8 до 128 символов): ')
const repeat = await askHidden('Повторите пароль: ')
rl.close()
if (password.length < 8 || password.length > 128) {
  console.error(
    'Пароль должен содержать от 8 до 128 символов; ничего не изменено',
  )
  process.exit(1)
}
if (password !== repeat) {
  console.error('Пароли не совпадают; ничего не изменено')
  process.exit(1)
}
unlinkQuazar(db, user.id, await hashPassword(password))
db.close()
console.log(
  'Квазар отвязан, вход по паролю открыт. Сессии пользователя завершены.',
)
