import { canChatWith, messageThreadKey } from './store.mjs'

// Read marks: the newest message time each user has seen in each thread.
// Messages sent before this feature appeared count as read (unreadSince).
export function initUnread(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS message_reads (
    userId TEXT NOT NULL REFERENCES users(id),
    threadKey TEXT NOT NULL,
    lastRead TEXT NOT NULL,
    PRIMARY KEY (userId, threadKey)
  );
  CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`)
  db.prepare(
    `INSERT OR IGNORE INTO app_meta (key, value) VALUES ('unreadSince', ?)`,
  ).run(new Date().toISOString())
}

/**
 * Which messages of the thread are addressed to the viewer. A student
 * thread is shared by staff, but a student writes only to their teacher.
 */
function incoming(viewer, peer, threadKey) {
  if (threadKey === viewer.id) return { sql: 'senderId != ?', arg: viewer.id }
  if (threadKey === peer.id && peer.teacherId !== viewer.id) return null
  return { sql: 'senderId = ?', arg: peer.id }
}

const fullName = (user) => [user.name, user.surname].filter(Boolean).join(' ')

export function markRead(db, userId, threadKey, upTo) {
  if (!upTo) return
  db.prepare(
    `INSERT INTO message_reads (userId, threadKey, lastRead) VALUES (?,?,?)
     ON CONFLICT(userId, threadKey) DO UPDATE SET lastRead=max(lastRead, excluded.lastRead)`,
  ).run(userId, threadKey, upTo)
}

/** Unread counts per chat peer and the newest unread message. */
export function unreadSummary(db, viewer, peers, getUser) {
  const since = db
    .prepare(`SELECT value FROM app_meta WHERE key='unreadSince'`)
    .get().value
  const readOf = db.prepare(
    'SELECT lastRead FROM message_reads WHERE userId=? AND threadKey=?',
  )
  const result = { total: 0, peers: {}, latest: null }
  for (const peer of peers) {
    if (!canChatWith(viewer, peer)) continue
    const threadKey = messageThreadKey(viewer, peer)
    const filter = incoming(viewer, peer, threadKey)
    if (!filter) continue
    const read = readOf.get(viewer.id, threadKey)?.lastRead
    const after = read && read > since ? read : since
    const where = `threadKey=? AND ${filter.sql} AND created>?`
    const count = db
      .prepare(`SELECT count(*) AS n FROM messages WHERE ${where}`)
      .get(threadKey, filter.arg, after).n
    if (!count) continue
    result.peers[peer.id] = count
    result.total += count
    const last = db
      .prepare(
        `SELECT id, senderId, text, created FROM messages WHERE ${where}
         ORDER BY created DESC, rowid DESC LIMIT 1`,
      )
      .get(threadKey, filter.arg, after)
    if (!result.latest || last.created > result.latest.created)
      result.latest = {
        ...last,
        peerId: peer.id,
        text: last.text.slice(0, 160),
        senderName: fullName(getUser(last.senderId) || peer),
      }
  }
  return result
}
