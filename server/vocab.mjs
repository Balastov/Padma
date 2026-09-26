import { randomUUID } from 'node:crypto'
import { staff } from './store.mjs'
import { synthesizeSpeech } from './tts.mjs'

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status })
}
const clean = (value, max) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

const AUDIO_MAX = 1 * 1024 * 1024
const AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
])

export function initVocab(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS vocab_words (
    id TEXT PRIMARY KEY,
    word TEXT NOT NULL,
    transcription TEXT NOT NULL DEFAULT '',
    translation TEXT NOT NULL DEFAULT '',
    audio BLOB,
    audioMime TEXT NOT NULL DEFAULT '',
    createdBy TEXT NOT NULL REFERENCES users(id),
    created TEXT NOT NULL,
    updated TEXT NOT NULL
  )`)
}

function publicWord(row) {
  if (!row) return null
  return {
    id: row.id,
    word: row.word,
    transcription: row.transcription,
    translation: row.translation,
    hasAudio: Boolean(row.audio && row.audioMime),
    audioMime: row.audioMime || '',
    createdBy: row.createdBy,
    created: row.created,
    updated: row.updated,
  }
}

function parseAudio(payload) {
  if (payload === undefined || payload === null) return undefined
  if (payload === '') return { data: null, mime: '' }
  if (typeof payload !== 'string') fail(400, 'Некорректный аудиофайл')
  const match = /^data:(audio\/(?:mpeg|wav|ogg|mp4));base64,([A-Za-z0-9+/=]+)$/.exec(
    payload,
  )
  let mime
  let b64
  if (match) {
    mime = match[1]
    b64 = match[2]
  } else if (/^[A-Za-z0-9+/=]+$/.test(payload) && payload.length > 16) {
    mime = 'audio/mpeg'
    b64 = payload
  } else fail(400, 'Аудио: data URL или base64 (mpeg, wav, ogg, mp4)')
  if (!AUDIO_MIMES.has(mime)) fail(400, 'Допустимы mpeg, wav, ogg, mp4')
  const data = Buffer.from(b64, 'base64')
  if (!data.length || data.length > AUDIO_MAX)
    fail(400, 'Аудиофайл: от 1 байта до 1 МБ')
  if (data.toString('base64') !== b64.replace(/\s/g, ''))
    fail(400, 'Некорректный аудиофайл')
  return { data, mime }
}

export async function vocabRoute({ path, req, res, db, user, body, send }) {
  if (!path.startsWith('/api/vocab')) return false

  if (path === '/api/vocab' && req.method === 'GET') {
    const rows = db
      .prepare(
        `SELECT id, word, transcription, translation, audioMime, createdBy, created, updated,
                CASE WHEN audio IS NOT NULL AND length(audio) > 0 THEN 1 ELSE 0 END AS hasAudioFlag
         FROM vocab_words ORDER BY word COLLATE NOCASE, id`,
      )
      .all()
    send(
      200,
      rows.map((row) => ({
        id: row.id,
        word: row.word,
        transcription: row.transcription,
        translation: row.translation,
        hasAudio: Boolean(row.hasAudioFlag),
        audioMime: row.audioMime || '',
        createdBy: row.createdBy,
        created: row.created,
        updated: row.updated,
      })),
    )
    return true
  }

  if (path === '/api/vocab' && req.method === 'POST') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const data = await body(req, 2_000_000)
    const word = clean(data.word, 80)
    const transcription = clean(data.transcription, 120)
    const translation = clean(data.translation, 200)
    if (!word) fail(400, 'Укажите слово')
    let audio = null
    let audioMime = ''
    if (data.tts === true) {
      const spoken = await synthesizeSpeech(word)
      audio = spoken.data
      audioMime = spoken.mime
    } else {
      const parsed = parseAudio(data.audio)
      if (parsed && parsed.data) {
        audio = parsed.data
        audioMime = parsed.mime
      }
    }
    const now = new Date().toISOString()
    const id = randomUUID()
    db.prepare(
      `INSERT INTO vocab_words
       (id, word, transcription, translation, audio, audioMime, createdBy, created, updated)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      word,
      transcription,
      translation,
      audio,
      audioMime,
      user.id,
      now,
      now,
    )
    send(
      201,
      publicWord(
        db.prepare('SELECT * FROM vocab_words WHERE id=?').get(id),
      ),
    )
    return true
  }

  const one = /^\/api\/vocab\/([^/]+)$/.exec(path)
  if (one) {
    const id = one[1]
    const row = db.prepare('SELECT * FROM vocab_words WHERE id=?').get(id)
    if (!row) fail(404, 'Слово не найдено')

    if (req.method === 'GET') {
      send(200, publicWord(row))
      return true
    }

    if (req.method === 'PATCH') {
      if (!staff(user)) fail(403, 'Нет доступа')
      const data = await body(req, 2_000_000)
      const word =
        data.word !== undefined ? clean(data.word, 80) : row.word
      const transcription =
        data.transcription !== undefined
          ? clean(data.transcription, 120)
          : row.transcription
      const translation =
        data.translation !== undefined
          ? clean(data.translation, 200)
          : row.translation
      if (!word) fail(400, 'Укажите слово')
      let audio = row.audio
      let audioMime = row.audioMime || ''
      if (data.tts === true) {
        const spoken = await synthesizeSpeech(word)
        audio = spoken.data
        audioMime = spoken.mime
      } else if (data.audio !== undefined) {
        const parsed = parseAudio(data.audio)
        if (parsed.data === null) {
          audio = null
          audioMime = ''
        } else if (parsed.data) {
          audio = parsed.data
          audioMime = parsed.mime
        }
      }
      const updated = new Date().toISOString()
      db.prepare(
        `UPDATE vocab_words SET word=?, transcription=?, translation=?,
         audio=?, audioMime=?, updated=? WHERE id=?`,
      ).run(word, transcription, translation, audio, audioMime, updated, id)
      send(
        200,
        publicWord(
          db.prepare('SELECT * FROM vocab_words WHERE id=?').get(id),
        ),
      )
      return true
    }

    if (req.method === 'DELETE') {
      if (!staff(user)) fail(403, 'Нет доступа')
      db.prepare('DELETE FROM vocab_words WHERE id=?').run(id)
      send(200, { ok: true })
      return true
    }
  }

  const audioPath = /^\/api\/vocab\/([^/]+)\/audio$/.exec(path)
  if (audioPath && req.method === 'GET') {
    const row = db
      .prepare('SELECT audio, audioMime FROM vocab_words WHERE id=?')
      .get(audioPath[1])
    if (!row?.audio || !row.audioMime) fail(404, 'Аудио недоступно')
    const buf = Buffer.from(row.audio)
    res.writeHead(200, {
      'Content-Type': row.audioMime,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': buf.length,
    })
    res.end(buf)
    return true
  }

  fail(404, 'Не найдено')
}
