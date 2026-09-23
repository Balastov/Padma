import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import webpush from 'web-push'

export function loadVapidKeys(dbPath) {
  if (dbPath === ':memory:') {
    const keys = webpush.generateVAPIDKeys()
    webpush.setVapidDetails('mailto:padma@localhost', keys.publicKey, keys.privateKey)
    return keys
  }
  const dir = dirname(dbPath)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const file = join(dir, 'vapid.json')
  let keys
  if (existsSync(file)) {
    keys = JSON.parse(readFileSync(file, 'utf8'))
  } else {
    keys = webpush.generateVAPIDKeys()
    writeFileSync(file, JSON.stringify(keys, null, 2), { mode: 0o600 })
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:notify@padma.ru',
    keys.publicKey,
    keys.privateKey,
  )
  return keys
}

export async function sendPushToUser(db, userId, payload) {
  const row = db
    .prepare('SELECT notificationsEnabled FROM users WHERE id=? AND archived=0')
    .get(userId)
  if (!row?.notificationsEnabled) return
  const subs = db
    .prepare(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE userId=?',
    )
    .all(userId)
  const body = JSON.stringify(payload)
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: 60 * 60 * 12 },
        )
      } catch (error) {
        const status = error?.statusCode
        if (status === 404 || status === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(
            sub.endpoint,
          )
        }
      }
    }),
  )
}
