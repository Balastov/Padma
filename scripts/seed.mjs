import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { openStore, hashPassword } from '../server/store.mjs'

// Read credentials locally, never print or persist the source document.
const path = process.argv[2]
if (!path)
  throw new Error(
    'Укажите путь к локальному DOCX с начальными учётными записями',
  )
const source = execFileSync(
  '/usr/bin/textutil',
  ['-convert', 'txt', '-stdout', path],
  { encoding: 'utf8' },
)
const records = [
  ...source.matchAll(
    /([\w.+-]+@[\w.-]+\.[a-z]+)[\s\u2028]+([^\s\u2028]+)[\s\u2028]+Роли\s*[–—-]\s*([^\n\u2028]+)/gi,
  ),
]
if (records.length !== 2)
  throw new Error('Ожидались две начальные учётные записи; база не изменена')
const db = openStore(process.env.PADMA_DB || '.data/padma.sqlite')
let count = 0
for (const [, email, password, rolesText] of records) {
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) continue
  const roles = [
    'owner',
    'teacher',
    ...(rolesText.includes('Администратор') ? ['admin'] : []),
  ]
  const name = roles.includes('admin') ? 'Алексей' : 'Милада'
  db.prepare(
    'INSERT INTO users (id,name,email,password,roles) VALUES (?,?,?,?,?)',
  ).run(
    randomUUID(),
    name,
    email.toLowerCase(),
    await hashPassword(password),
    JSON.stringify(roles),
  )
  count++
}
db.close()
console.log(
  `Создано учётных записей: ${count}. Пароли сохранены только в виде хешей.`,
)
