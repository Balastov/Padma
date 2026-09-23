import { createServer } from 'node:http'
import { initHomework, homeworkRoute } from './homework.mjs'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  openStore,
  publicUser,
  privileged,
  staff,
  ROLES,
  hashPassword,
  verifyPassword,
  tokenHash,
  normalizePhone,
  isCompleteRuPhone,
  isValidForeignPhone,
} from './store.mjs'

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status })
}
const text = (value, max = 200) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''
const passwordValid = (value) =>
  typeof value === 'string' && value.length >= 8 && value.length <= 128
const emailValid = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
export function createApp({
  dbPath = process.env.PADMA_DB || '.data/padma.sqlite',
  origins = (
    process.env.APP_ORIGIN ||
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001'
  ).split(','),
  secure = process.env.NODE_ENV === 'production',
} = {}) {
  const db = openStore(dbPath)
  initHomework(db)
  const attempts = new Map()
  const getUser = (id) =>
    publicUser(
      db.prepare('SELECT * FROM users WHERE id=? AND archived=0').get(id),
    )
  const users = () =>
    db
      .prepare('SELECT * FROM users WHERE archived=0 ORDER BY name')
      .all()
      .map(publicUser)
  const canStudent = (user, student) =>
    student &&
    student.roles.includes('student') &&
    (privileged(user) ||
      student.teacherId === user.id ||
      student.id === user.id)
  const cookie = (token) =>
    `padma_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 604800 : 0}${secure ? '; Secure' : ''}`
  const dummyHash = hashPassword(randomBytes(24).toString('hex'))
  async function body(req, limit = 3500000) {
    if (!req.headers['content-type']?.startsWith('application/json'))
      fail(415, 'Ожидается JSON')
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > limit) fail(413, 'Слишком большой запрос')
      chunks.push(chunk)
    }
    const raw = Buffer.concat(chunks).toString('utf8')
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        fail(400, 'Некорректный запрос')
      return parsed
    } catch {
      fail(400, 'Некорректный запрос')
    }
  }
  const server = createServer(async (req, res) => {
    const send = (status, data, headers = {}) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...headers,
      })
      res.end(JSON.stringify(data))
    }
    try {
      const path = new URL(req.url, 'http://localhost').pathname
      if (!path.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(req.method))
          fail(405, 'Метод не поддерживается')
        const root = resolve('dist')
        let file = resolve(root, '.' + decodeURIComponent(path))
        if (!file.startsWith(root + sep) && file !== root)
          fail(403, 'Нет доступа')
        try {
          if (!(await stat(file)).isFile()) file = resolve(root, 'index.html')
        } catch {
          file = resolve(root, 'index.html')
        }
        const content = await readFile(file)
        const mime = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.woff2': 'font/woff2',
          '.ttf': 'font/ttf',
        }
        res.writeHead(200, {
          'Content-Type': mime[extname(file)] || 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'same-origin',
          'Content-Security-Policy':
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        })
        return res.end(req.method === 'HEAD' ? undefined : content)
      }
      if (path === '/api/health' && req.method === 'GET') {
        db.prepare('SELECT 1').get()
        return send(200, { ok: true })
      }
      if (
        !['GET', 'HEAD'].includes(req.method) &&
        !origins.includes(req.headers.origin)
      )
        fail(403, 'Недопустимый источник запроса')
      const token =
        /(?:^|;\s*)padma_session=([^;]*)/.exec(req.headers.cookie || '')?.[1] ||
        ''
      const session = db
        .prepare('SELECT userId FROM sessions WHERE token=? AND expires>?')
        .get(tokenHash(token), Date.now())
      const user = session ? getUser(session.userId) : null
      if (path === '/api/login' && req.method === 'POST') {
        const data = await body(req)
        const key = req.socket.remoteAddress
        const now = Date.now()
        for (const [address, value] of attempts)
          if (now - value.since > 900000) attempts.delete(address)
        const attempt = attempts.get(key) || { count: 0, since: now }
        if (attempt.count >= 20)
          fail(429, 'Слишком много попыток. Повторите через 15 минут.')
        attempt.count++
        attempts.set(key, attempt)
        if (typeof data.password !== 'string' || data.password.length > 128)
          fail(401, 'Неверный логин или пароль')
        const email = text(data.email).toLowerCase()
        const phone = normalizePhone(text(data.phone, 32))
        if (!email && !phone) fail(401, 'Неверный логин или пароль')
        const row = email
          ? db
              .prepare('SELECT * FROM users WHERE email=? AND archived=0')
              .get(email)
          : db
              .prepare('SELECT * FROM users WHERE phone=? AND archived=0')
              .get(phone)
        const valid = await verifyPassword(
          data.password,
          row?.password || (await dummyHash),
        )
        if (!row || !valid) fail(401, 'Неверный логин или пароль')
        attempts.delete(key)
        db.prepare('DELETE FROM sessions WHERE expires<?').run(now)
        const nextToken = randomBytes(32).toString('hex')
        db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash(token))
        db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(
          tokenHash(nextToken),
          row.id,
          now + 604800000,
        )
        return send(200, publicUser(row), { 'Set-Cookie': cookie(nextToken) })
      }
      if (!user) fail(401, 'Войдите в свой аккаунт')
      if (
        await homeworkRoute({ path, req, res, db, user, body, send, getUser })
      )
        return
      if (path === '/api/me' && req.method === 'GET') return send(200, user)
      if (path === '/api/logout' && req.method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash(token))
        return send(200, { ok: true }, { 'Set-Cookie': cookie('') })
      }
      if (path === '/api/profile' && req.method === 'PATCH') {
        const data = await body(req)
        const name = text(data.name, 80),
          surname = text(data.surname, 80),
          email = text(data.email).toLowerCase()
        const foreignPhone = Boolean(data.foreignPhone)
        const phone = normalizePhone(text(data.phone, 32), foreignPhone)
        const photo = data.photo || ''
        if (!name) fail(400, 'Укажите имя')
        if (email && !emailValid(email))
          fail(400, 'Укажите корректный email')
        if (phone) {
          if (foreignPhone) {
            if (!isValidForeignPhone(phone))
              fail(400, 'Укажите корректный номер телефона')
          } else if (!isCompleteRuPhone(phone)) {
            fail(400, 'Укажите номер РФ: +7 и 10 цифр, начиная с 9')
          }
        }
        if (!email && !phone)
          fail(400, 'Укажите email или номер телефона')
        if (
          typeof photo !== 'string' ||
          photo.length > 2900000 ||
          (photo &&
            !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(photo))
        )
          fail(400, 'Фото: JPG, PNG или WebP до 2 МБ')
        if (data.password) {
          if (
            !passwordValid(data.password) ||
            typeof data.currentPassword !== 'string' ||
            data.currentPassword.length > 128
          )
            fail(
              400,
              'Укажите текущий пароль и новый пароль от 8 до 128 символов',
            )
          const oldHash = db
            .prepare('SELECT password FROM users WHERE id=?')
            .get(user.id).password
          if (!(await verifyPassword(data.currentPassword, oldHash)))
            fail(400, 'Текущий пароль неверен')
          const nextHash = await hashPassword(data.password)
          db.prepare('UPDATE users SET password=? WHERE id=?').run(
            nextHash,
            user.id,
          )
          db.prepare('DELETE FROM sessions WHERE userId=?').run(user.id)
        }
        let roles = user.roles
        let teacherId = user.teacherId
        if (privileged(user)) {
          if (Array.isArray(data.roles)) {
            if (
              !data.roles.length ||
              data.roles.some((r) => !ROLES.includes(r))
            )
              fail(400, 'Выберите роль')
            if (
              user.roles.includes('owner') &&
              !data.roles.includes('owner') &&
              users().filter((u) => u.roles.includes('owner')).length === 1
            )
              fail(400, 'Нельзя убрать последнего владельца')
            if (
              user.roles.includes('teacher') &&
              !data.roles.includes('teacher') &&
              users().some((u) => u.teacherId === user.id)
            )
              fail(400, 'Сначала переназначьте учеников этого учителя')
            roles = [...new Set(data.roles)]
          }
          teacherId = data.teacherId || null
          if (teacherId && !getUser(teacherId)?.roles.includes('teacher'))
            fail(400, 'Выберите действующего учителя')
        }
        try {
          db.prepare(
            'UPDATE users SET name=?,surname=?,email=?,phone=?,photo=?,roles=?,teacherId=? WHERE id=?',
          ).run(
            name,
            surname,
            email,
            phone,
            photo,
            JSON.stringify(roles),
            teacherId,
            user.id,
          )
        } catch (error) {
          if (String(error).includes('UNIQUE'))
            fail(
              409,
              String(error).includes('phone')
                ? 'Этот телефон уже используется'
                : 'Этот email уже используется',
            )
          throw error
        }
        if (
          privileged(user) &&
          JSON.stringify(user.roles) !== JSON.stringify(roles)
        )
          db.prepare('DELETE FROM sessions WHERE userId=?').run(user.id)
        return send(200, getUser(user.id))
      }
      if (path === '/api/users' && req.method === 'GET') {
        if (!staff(user)) fail(403, 'Нет доступа к справочнику')
        return send(200, users())
      }
      if (path === '/api/teachers' && req.method === 'GET') {
        return send(
          200,
          users()
            .filter(
              (u) =>
                u.roles.includes('teacher') &&
                (staff(user) || u.id === user.teacherId),
            )
            .map(({ id, name, surname, photo }) => ({
              id,
              name,
              surname,
              photo,
            })),
        )
      }
      if (
        (path === '/api/users' && req.method === 'POST') ||
        (/^\/api\/users\/[^/]+$/.test(path) &&
          ['PATCH', 'DELETE'].includes(req.method))
      ) {
        if (!staff(user)) fail(403, 'Нет доступа')
        const id = req.method === 'POST' ? randomUUID() : path.split('/').pop()
        const old = req.method === 'POST' ? null : getUser(id)
        if (req.method !== 'POST' && !old) fail(404, 'Пользователь не найден')
        if (req.method === 'DELETE') {
          if (
            !privileged(user) ||
            old.roles.some((r) => ['owner', 'admin', 'teacher'].includes(r))
          )
            fail(403, 'Можно архивировать только учеников и гостей')
          db.prepare('UPDATE users SET archived=1 WHERE id=?').run(id)
          db.prepare('DELETE FROM sessions WHERE userId=?').run(id)
          return send(200, { ok: true })
        }
        if (
          !privileged(user) &&
          old &&
          (!canStudent(user, old) || old.roles.some((r) => r !== 'student'))
        )
          fail(403, 'Нет доступа')
        const data = await body(req)
        const name = text(data.name, 80),
          surname = text(data.surname, 80),
          email = text(data.email).toLowerCase()
        const foreignPhone = Boolean(data.foreignPhone)
        const phone = normalizePhone(text(data.phone, 32), foreignPhone)
        const roles = data.roles
        const teacherId = data.teacherId || null
        if (!name) fail(400, 'Укажите имя')
        if (email && !emailValid(email))
          fail(400, 'Укажите корректный email')
        if (phone) {
          if (foreignPhone) {
            if (!isValidForeignPhone(phone))
              fail(400, 'Укажите корректный номер телефона')
          } else if (!isCompleteRuPhone(phone)) {
            fail(
              400,
              'Укажите номер РФ: +7 и 10 цифр, начиная с 9',
            )
          }
        }
        if (!email && !phone)
          fail(400, 'Укажите email или номер телефона')
        if (
          !Array.isArray(roles) ||
          !roles.length ||
          roles.some((r) => !ROLES.includes(r))
        )
          fail(400, 'Выберите роль')
        if (
          !privileged(user) &&
          (roles.length !== 1 ||
            roles[0] !== 'student' ||
            teacherId !== user.id)
        )
          fail(403, 'Учитель может создавать только своих учеников')
        if (teacherId && !getUser(teacherId)?.roles.includes('teacher'))
          fail(400, 'Выберите действующего учителя')
        if (
          old?.roles.includes('owner') &&
          !roles.includes('owner') &&
          users().filter((u) => u.roles.includes('owner')).length === 1
        )
          fail(400, 'Нельзя убрать последнего владельца')
        if (
          old?.roles.includes('teacher') &&
          !roles.includes('teacher') &&
          users().some((u) => u.teacherId === id)
        )
          fail(400, 'Сначала переназначьте учеников этого учителя')
        const photo = data.photo || ''
        if (
          typeof photo !== 'string' ||
          (photo &&
            !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(photo))
        )
          fail(400, 'Фото: JPG, PNG или WebP')
        if (photo.length > 2900000) fail(400, 'Фото слишком большое')
        if ((!old || data.password) && !passwordValid(data.password))
          fail(400, 'Пароль должен содержать от 8 до 128 символов')
        const hash = data.password
          ? await hashPassword(data.password)
          : db.prepare('SELECT password FROM users WHERE id=?').get(id)
              ?.password
        try {
          if (old) {
            db.prepare(
              'UPDATE users SET name=?,surname=?,email=?,phone=?,password=?,roles=?,teacherId=?,photo=? WHERE id=?',
            ).run(
              name,
              surname,
              email,
              phone,
              hash,
              JSON.stringify([...new Set(roles)]),
              teacherId,
              photo,
              id,
            )
            if (
              data.password ||
              JSON.stringify(old.roles) !== JSON.stringify(roles)
            )
              db.prepare('DELETE FROM sessions WHERE userId=?').run(id)
          } else
            db.prepare(
              'INSERT INTO users (id,name,surname,email,phone,password,roles,teacherId,photo) VALUES (?,?,?,?,?,?,?,?,?)',
            ).run(
              id,
              name,
              surname,
              email,
              phone,
              hash,
              JSON.stringify([...new Set(roles)]),
              teacherId,
              photo,
            )
        } catch (error) {
          if (String(error).includes('UNIQUE'))
            fail(
              409,
              String(error).includes('phone')
                ? 'Этот телефон уже используется'
                : 'Этот email уже используется',
            )
          throw error
        }
        return send(old ? 200 : 201, getUser(id))
      }
      if (path === '/api/lessons' && req.method === 'GET') {
        const all = db
          .prepare(
            'SELECT l.* FROM lessons l JOIN users u ON l.studentId=u.id WHERE u.archived=0 ORDER BY date,start',
          )
          .all()
        return send(
          200,
          all.filter(
            (l) =>
              privileged(user) ||
              l.teacherId === user.id ||
              l.studentId === user.id,
          ),
        )
      }
      if (path === '/api/lessons' && req.method === 'POST') {
        if (!staff(user)) fail(403, 'Нет доступа')
        const data = await body(req)
        const student = getUser(data.studentId)
        if (!canStudent(user, student)) fail(403, 'Ученик недоступен')
        if (!student.teacherId) fail(400, 'Сначала назначьте ученику учителя')
        const date = text(data.date, 10),
          start = text(data.start, 5),
          end = text(data.end, 5)
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          isNaN(Date.parse(date)) ||
          new Date(date).toISOString().slice(0, 10) !== date ||
          ![start, end].every((v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) ||
          minutes(start) >= minutes(end)
        )
          fail(400, 'Укажите корректные дату и время: конец позже начала')
        const count = data.repeat ? Number(data.weeks) : 1
        if (!Number.isInteger(count) || count < 1 || count > 12)
          fail(400, 'Повторение: от 1 до 12 недель')
        const created = []
        db.exec('BEGIN IMMEDIATE')
        try {
          for (let i = 0; i < count; i++) {
            const day = new Date(date + 'T12:00:00Z')
            day.setUTCDate(day.getUTCDate() + i * 7)
            const nextDate = day.toISOString().slice(0, 10)
            const conflict = db
              .prepare(
                'SELECT l.id FROM lessons l JOIN users u ON l.studentId=u.id WHERE u.archived=0 AND l.date=? AND (l.teacherId=? OR l.studentId=?) AND l.start<? AND l.end>?',
              )
              .get(nextDate, student.teacherId, student.id, end, start)
            if (conflict) fail(409, `На ${nextDate} это время уже занято`)
            const lesson = {
              id: randomUUID(),
              studentId: student.id,
              teacherId: student.teacherId,
              date: nextDate,
              start,
              end,
              title: text(data.title) || 'Английский язык',
              note: text(data.note, 500),
            }
            db.prepare('INSERT INTO lessons VALUES (?,?,?,?,?,?,?,?)').run(
              ...Object.values(lesson),
            )
            created.push(lesson)
          }
          db.exec('COMMIT')
        } catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
        return send(201, created)
      }
      if (/^\/api\/lessons\/[^/]+$/.test(path) && req.method === 'DELETE') {
        const id = path.split('/').pop()
        const lesson = db.prepare('SELECT * FROM lessons WHERE id=?').get(id)
        if (!lesson) fail(404, 'Занятие не найдено')
        if (
          !privileged(user) &&
          !(user.roles.includes('teacher') && lesson.teacherId === user.id)
        )
          fail(403, 'Нет доступа')
        db.prepare('DELETE FROM lessons WHERE id=?').run(id)
        return send(200, { ok: true })
      }
      if (
        /^\/api\/messages\/[^/]+$/.test(path) &&
        ['GET', 'POST'].includes(req.method)
      ) {
        const studentId = path.split('/').pop(),
          student = getUser(studentId)
        if (!student?.roles.includes('student')) fail(403, 'Чат недоступен')
        if (staff(user)) {
          // owner, admin and teacher may open any student chat
        } else if (user.id === student.id && student.teacherId) {
          // student chats with their assigned teacher thread
        } else {
          fail(403, 'Чат недоступен')
        }
        if (req.method === 'GET')
          return send(
            200,
            db
              .prepare(
                'SELECT * FROM messages WHERE studentId=? ORDER BY created',
              )
              .all(studentId),
          )
        const data = await body(req),
          message = text(data.text, 2000)
        if (!message) fail(400, 'Введите сообщение')
        const result = {
          id: randomUUID(),
          studentId,
          senderId: user.id,
          text: message,
          created: new Date().toISOString(),
        }
        db.prepare('INSERT INTO messages VALUES (?,?,?,?,?)').run(
          ...Object.values(result),
        )
        return send(201, result)
      }
      fail(404, 'Не найдено')
    } catch (error) {
      send(error.status || 500, {
        error: error.status ? error.message : 'Не удалось выполнить запрос',
      })
    }
  })
  server.on('close', () => db.close())
  return { server, db }
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const { server } = createApp()
  server.listen(
    Number(process.env.PORT || 3001),
    process.env.HOST || '127.0.0.1',
    () =>
      console.log('Padma server ready on port ' + (process.env.PORT || 3001)),
  )
}
