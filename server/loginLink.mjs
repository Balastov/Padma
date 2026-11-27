// Server rescue when Quazar is unavailable: a one-time login link for an
// account found by phone or email (15 minutes, once). The Quazar link stays.
// On the server (see DEPLOY.md, «Если Квазар недоступен»):
//   cd /var/www/padma/current
//   sudo -u padma env PADMA_DB=/var/lib/padma/padma.sqlite \
//     PADMA_URL=https://www.padma.ru \
//     /opt/padma/node/bin/node server/loginLink.mjs +79991234567
import { normalizePhone, openStore } from './store.mjs'
import { createLoginLink, initAccess } from './access.mjs'

const login = (process.argv[2] || '').trim()
const base =
  process.env.PADMA_URL || (process.env.APP_ORIGIN || '').split(',')[0]
if (!login) {
  console.error('Укажите телефон или email пользователя')
  process.exit(1)
}
if (!/^https?:\/\/[^/]+$/.test(base)) {
  console.error('Укажите адрес сайта: PADMA_URL=https://www.padma.ru')
  process.exit(1)
}
const db = openStore(process.env.PADMA_DB || '.data/padma.sqlite')
initAccess(db)
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
const { url } = createLoginLink(db, user.id, null, base)
db.close()
const name = [user.name, user.surname].filter(Boolean).join(' ')
console.log(`Ссылка для входа: ${name}. Действует 15 минут, один раз.`)
console.log(url)
