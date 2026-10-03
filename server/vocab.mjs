import { randomUUID } from 'node:crypto'
import { staff, privileged } from './store.mjs'
import { synthesizeSpeech } from './tts.mjs'

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status })
}
const clean = (value, max) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''
const LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', ''])
const KINDS = new Set(['main', 'lexical'])
const EXERCISES = new Set([
  'cards',
  'training-cards',
  'assemble',
  'choose-translation',
  'assemble-audio',
  'choose-translation-audio',
  'find-word',
  'match-pairs',
  'true-false',
  'memory',
])
const ALL_EXERCISES = [...EXERCISES]
const AUDIO_MAX = 1 * 1024 * 1024
const AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
])

function addColumn(db, table, column, definition) {
  const cols = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name)
  if (!cols.includes(column))
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

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
  addColumn(db, 'vocab_words', 'level', "TEXT NOT NULL DEFAULT ''")
  addColumn(db, 'vocab_words', 'pos', "TEXT NOT NULL DEFAULT ''")
  addColumn(db, 'vocab_words', 'shortMeaning', "TEXT NOT NULL DEFAULT ''")
  addColumn(db, 'vocab_words', 'exampleEn', "TEXT NOT NULL DEFAULT ''")
  addColumn(db, 'vocab_words', 'exampleRu', "TEXT NOT NULL DEFAULT ''")
  addColumn(db, 'vocab_words', 'topicId', 'TEXT')
  addColumn(db, 'vocab_words', 'subtopicId', 'TEXT')
  addColumn(db, 'vocab_words', 'archived', 'INTEGER NOT NULL DEFAULT 0')

  db.exec(`
    CREATE TABLE IF NOT EXISTS vocab_topics (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'main',
      createdBy TEXT NOT NULL REFERENCES users(id),
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS vocab_subtopics (
      id TEXT PRIMARY KEY,
      topicId TEXT NOT NULL REFERENCES vocab_topics(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      createdBy TEXT NOT NULL REFERENCES users(id),
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS vocab_collections (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      createdBy TEXT NOT NULL REFERENCES users(id),
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS vocab_collection_words (
      collectionId TEXT NOT NULL REFERENCES vocab_collections(id) ON DELETE CASCADE,
      wordId TEXT NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (collectionId, wordId)
    );
    CREATE TABLE IF NOT EXISTS vocab_lesson_words (
      lessonId TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      wordId TEXT NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (lessonId, wordId)
    );
    CREATE TABLE IF NOT EXISTS vocab_groups (
      id TEXT PRIMARY KEY,
      teacherId TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      created TEXT NOT NULL,
      updated TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vocab_group_members (
      groupId TEXT NOT NULL REFERENCES vocab_groups(id) ON DELETE CASCADE,
      studentId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (groupId, studentId)
    );
    CREATE TABLE IF NOT EXISTS vocab_assignments (
      id TEXT PRIMARY KEY,
      teacherId TEXT NOT NULL REFERENCES users(id),
      targetType TEXT NOT NULL,
      targetId TEXT NOT NULL,
      sourceType TEXT NOT NULL,
      sourceId TEXT NOT NULL DEFAULT '',
      exercises TEXT NOT NULL DEFAULT '[]',
      created TEXT NOT NULL,
      updated TEXT NOT NULL
    );
  `)
}

function hasAudio(row) {
  return Boolean(row?.audio && row.audioMime)
}

function publicWord(row, extras = {}) {
  if (!row) return null
  return {
    id: row.id,
    word: row.word,
    transcription: row.transcription || '',
    translation: row.translation || '',
    level: row.level || '',
    pos: row.pos || '',
    shortMeaning: row.shortMeaning || '',
    exampleEn: row.exampleEn || '',
    exampleRu: row.exampleRu || '',
    topicId: row.topicId || null,
    subtopicId: row.subtopicId || null,
    archived: Boolean(row.archived),
    hasAudio: hasAudio(row) || Boolean(row.hasAudioFlag),
    audioMime: row.audioMime || '',
    createdBy: row.createdBy,
    created: row.created,
    updated: row.updated,
    ...extras,
  }
}

function parseAudio(payload) {
  if (payload === undefined || payload === null) return undefined
  if (payload === '') return { data: null, mime: '' }
  if (typeof payload !== 'string') fail(400, 'Некорректный аудиофайл')
  const match =
    /^data:(audio\/(?:mpeg|wav|ogg|mp4));base64,([A-Za-z0-9+/=]+)$/.exec(
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

function wordFieldsFromBody(data, row = {}) {
  const word = data.word !== undefined ? clean(data.word, 80) : row.word
  const transcription =
    data.transcription !== undefined
      ? clean(data.transcription, 120)
      : row.transcription || ''
  const translation =
    data.translation !== undefined
      ? clean(data.translation, 200)
      : row.translation || ''
  const level =
    data.level !== undefined ? clean(data.level, 8) : row.level || ''
  const pos = data.pos !== undefined ? clean(data.pos, 40) : row.pos || ''
  const shortMeaning =
    data.shortMeaning !== undefined
      ? clean(data.shortMeaning, 200)
      : row.shortMeaning || ''
  const exampleEn =
    data.exampleEn !== undefined
      ? clean(data.exampleEn, 500)
      : row.exampleEn || ''
  const exampleRu =
    data.exampleRu !== undefined
      ? clean(data.exampleRu, 500)
      : row.exampleRu || ''
  const topicId =
    data.topicId !== undefined
      ? data.topicId
        ? clean(data.topicId, 64)
        : null
      : row.topicId || null
  const subtopicId =
    data.subtopicId !== undefined
      ? data.subtopicId
        ? clean(data.subtopicId, 64)
        : null
      : row.subtopicId || null
  if (!word) fail(400, 'Укажите слово')
  if (!LEVELS.has(level)) fail(400, 'Некорректный уровень')
  return {
    word,
    transcription,
    translation,
    level,
    pos,
    shortMeaning,
    exampleEn,
    exampleRu,
    topicId,
    subtopicId,
  }
}

function canManageLesson(db, user, lessonId) {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id=?').get(lessonId)
  if (!lesson) fail(404, 'Занятие не найдено')
  if (privileged(user) || lesson.teacherId === user.id) return lesson
  fail(403, 'Нет доступа')
}

function groupMemberIds(db, groupId) {
  return db
    .prepare('SELECT studentId FROM vocab_group_members WHERE groupId=?')
    .all(groupId)
    .map((r) => r.studentId)
}

function assignmentTargetsStudent(db, assignment, studentId) {
  if (assignment.targetType === 'student')
    return assignment.targetId === studentId
  if (assignment.targetType === 'group')
    return groupMemberIds(db, assignment.targetId).includes(studentId)
  return false
}

function wordIdsForSource(db, sourceType, sourceId) {
  if (sourceType === 'topic') {
    return db
      .prepare(
        `SELECT id FROM vocab_words WHERE archived=0 AND topicId=?`,
      )
      .all(sourceId)
      .map((r) => r.id)
  }
  if (sourceType === 'subtopic') {
    return db
      .prepare(
        `SELECT id FROM vocab_words WHERE archived=0 AND subtopicId=?`,
      )
      .all(sourceId)
      .map((r) => r.id)
  }
  if (sourceType === 'collection') {
    return db
      .prepare(
        `SELECT wordId FROM vocab_collection_words WHERE collectionId=?
         ORDER BY sortOrder, wordId`,
      )
      .all(sourceId)
      .map((r) => r.wordId)
  }
  if (sourceType === 'lesson') {
    return db
      .prepare(
        `SELECT wordId FROM vocab_lesson_words WHERE lessonId=?
         ORDER BY sortOrder, wordId`,
      )
      .all(sourceId)
      .map((r) => r.wordId)
  }
  if (sourceType === 'words') {
    return parseJson(sourceId, []).filter((id) => typeof id === 'string')
  }
  return []
}

function visibleCatalog(db, user) {
  const lessonWordRows = db
    .prepare(
      `SELECT lw.wordId, lw.lessonId FROM vocab_lesson_words lw
       JOIN lessons l ON l.id = lw.lessonId
       WHERE l.studentId=?`,
    )
    .all(user.id)
  const visibleWordIds = new Set(lessonWordRows.map((r) => r.wordId))
  const lessonIds = new Set(lessonWordRows.map((r) => r.lessonId))
  const exercisesBySource = {}
  const markExercises = (sourceType, sourceId, exercises) => {
    const key = `${sourceType}:${sourceId || ''}`
    if (!exercisesBySource[key]) exercisesBySource[key] = new Set()
    for (const ex of exercises) exercisesBySource[key].add(ex)
  }

  const assignments = db.prepare('SELECT * FROM vocab_assignments').all()
  const mine = assignments.filter((a) =>
    assignmentTargetsStudent(db, a, user.id),
  )
  const collectionIds = new Set()
  const topicIds = new Set()
  const subtopicIds = new Set()

  for (const a of mine) {
    const ids = wordIdsForSource(db, a.sourceType, a.sourceId)
    for (const id of ids) visibleWordIds.add(id)
    const exercises = parseJson(a.exercises, ALL_EXERCISES).filter((e) =>
      EXERCISES.has(e),
    )
    const list = exercises.length ? exercises : ALL_EXERCISES
    markExercises(a.sourceType, a.sourceId, list)
    if (a.sourceType === 'collection') collectionIds.add(a.sourceId)
    if (a.sourceType === 'topic') topicIds.add(a.sourceId)
    if (a.sourceType === 'subtopic') subtopicIds.add(a.sourceId)
    if (a.sourceType === 'lesson') lessonIds.add(a.sourceId)
  }

  // Own lessons with words: all exercise formats by default
  for (const lessonId of lessonIds) {
    const key = `lesson:${lessonId}`
    if (!exercisesBySource[key])
      markExercises('lesson', lessonId, ALL_EXERCISES)
  }

  const words = [...visibleWordIds]
    .map((id) =>
      publicWord(
        db
          .prepare('SELECT * FROM vocab_words WHERE id=? AND archived=0')
          .get(id),
      ),
    )
    .filter(Boolean)

  for (const w of words) {
    if (w.topicId) topicIds.add(w.topicId)
    if (w.subtopicId) subtopicIds.add(w.subtopicId)
  }

  const topics = db
    .prepare(
      `SELECT * FROM vocab_topics WHERE archived=0 ORDER BY kind, title COLLATE NOCASE`,
    )
    .all()
    .filter((t) => topicIds.has(t.id) || staff(user))
    .map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      kind: t.kind,
      imageStub: true,
      created: t.created,
      updated: t.updated,
    }))

  const subtopics = db
    .prepare(
      `SELECT * FROM vocab_subtopics WHERE archived=0 ORDER BY title COLLATE NOCASE`,
    )
    .all()
    .filter(
      (s) =>
        staff(user) ||
        subtopicIds.has(s.id) ||
        topicIds.has(s.topicId) ||
        words.some((w) => w.subtopicId === s.id),
    )
    .map((s) => ({
      id: s.id,
      topicId: s.topicId,
      title: s.title,
      description: s.description,
      imageStub: true,
      wordIds: words.filter((w) => w.subtopicId === s.id).map((w) => w.id),
      created: s.created,
      updated: s.updated,
    }))

  const collections = db
    .prepare(
      `SELECT * FROM vocab_collections WHERE archived=0 ORDER BY updated DESC`,
    )
    .all()
    .filter((c) => staff(user) || collectionIds.has(c.id))
    .map((c) => {
      const wordIds = db
        .prepare(
          `SELECT wordId FROM vocab_collection_words WHERE collectionId=?
           ORDER BY sortOrder, wordId`,
        )
        .all(c.id)
        .map((r) => r.wordId)
        .filter((id) => staff(user) || visibleWordIds.has(id) || collectionIds.has(c.id))
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        tags: parseJson(c.tags, []),
        wordIds: staff(user)
          ? wordIds
          : wordIds.filter((id) => visibleWordIds.has(id) || collectionIds.has(c.id)),
        imageStub: true,
        created: c.created,
        updated: c.updated,
      }
    })

  // For assigned collections, include all their words in catalog
  for (const c of collections) {
    if (!collectionIds.has(c.id) && !staff(user)) continue
    for (const id of c.wordIds) {
      if (!visibleWordIds.has(id)) {
        const w = publicWord(
          db
            .prepare('SELECT * FROM vocab_words WHERE id=? AND archived=0')
            .get(id),
        )
        if (w) {
          visibleWordIds.add(id)
          words.push(w)
        }
      }
    }
  }

  const lessons = [...lessonIds].map((id) => {
    const lesson = db.prepare('SELECT * FROM lessons WHERE id=?').get(id)
    if (!lesson) return null
    const wordIds = db
      .prepare(
        `SELECT wordId FROM vocab_lesson_words WHERE lessonId=?
         ORDER BY sortOrder, wordId`,
      )
      .all(id)
      .map((r) => r.wordId)
    return {
      id: lesson.id,
      title: lesson.title,
      date: lesson.date,
      start: lesson.start,
      end: lesson.end,
      studentId: lesson.studentId,
      teacherId: lesson.teacherId,
      wordIds,
      imageStub: true,
    }
  }).filter(Boolean)

  const allowedExercises = {}
  for (const [key, set] of Object.entries(exercisesBySource)) {
    allowedExercises[key] = [...set]
  }

  return {
    words: words.map((w) => ({
      ...w,
      lessonIds: lessons
        .filter((l) => l.wordIds.includes(w.id))
        .map((l) => l.id),
      relatedIds: [],
    })),
    topics: staff(user)
      ? db
          .prepare(
            `SELECT * FROM vocab_topics WHERE archived=0 ORDER BY kind, title COLLATE NOCASE`,
          )
          .all()
          .map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            kind: t.kind,
            imageStub: true,
            created: t.created,
            updated: t.updated,
            subtopicIds: db
              .prepare(
                `SELECT id FROM vocab_subtopics WHERE topicId=? AND archived=0`,
              )
              .all(t.id)
              .map((r) => r.id),
          }))
      : topics.map((t) => ({
          ...t,
          subtopicIds: subtopics
            .filter((s) => s.topicId === t.id)
            .map((s) => s.id),
        })),
    subtopics: staff(user)
      ? db
          .prepare(
            `SELECT * FROM vocab_subtopics WHERE archived=0 ORDER BY title COLLATE NOCASE`,
          )
          .all()
          .map((s) => ({
            id: s.id,
            topicId: s.topicId,
            title: s.title,
            description: s.description,
            imageStub: true,
            wordIds: db
              .prepare(
                `SELECT id FROM vocab_words WHERE subtopicId=? AND archived=0`,
              )
              .all(s.id)
              .map((r) => r.id),
            created: s.created,
            updated: s.updated,
          }))
      : subtopics,
    collections: staff(user)
      ? db
          .prepare(
            `SELECT * FROM vocab_collections WHERE archived=0 ORDER BY updated DESC`,
          )
          .all()
          .map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description,
            tags: parseJson(c.tags, []),
            wordIds: db
              .prepare(
                `SELECT wordId FROM vocab_collection_words WHERE collectionId=?
                 ORDER BY sortOrder, wordId`,
              )
              .all(c.id)
              .map((r) => r.wordId),
            imageStub: true,
            created: c.created,
            updated: c.updated,
          }))
      : collections,
    lessons,
    allowedExercises,
  }
}

function replaceLinkRows(db, table, parentCol, parentId, wordIds) {
  const ids = [...new Set(wordIds)].filter((id) => typeof id === 'string')
  for (const id of ids) {
    const w = db
      .prepare('SELECT id FROM vocab_words WHERE id=? AND archived=0')
      .get(id)
    if (!w) fail(400, 'Слово не найдено: ' + id)
  }
  db.prepare(`DELETE FROM ${table} WHERE ${parentCol}=?`).run(parentId)
  const insert = db.prepare(
    `INSERT INTO ${table} (${parentCol}, wordId, sortOrder) VALUES (?,?,?)`,
  )
  ids.forEach((id, i) => insert.run(parentId, id, i))
}

function publicAssignment(row) {
  return {
    id: row.id,
    teacherId: row.teacherId,
    targetType: row.targetType,
    targetId: row.targetId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    exercises: parseJson(row.exercises, []),
    created: row.created,
    updated: row.updated,
  }
}

export async function vocabRoute({ path, req, res, db, user, body, send }) {
  if (!path.startsWith('/api/vocab')) return false

  // Student/staff catalog bundle
  if (path === '/api/vocab/me/catalog' && req.method === 'GET') {
    if (staff(user)) {
      send(200, visibleCatalog(db, user))
      return true
    }
    send(200, visibleCatalog(db, user))
    return true
  }

  // ---- Topics ----
  if (path === '/api/vocab/topics' && req.method === 'GET') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const rows = db
      .prepare(
        `SELECT * FROM vocab_topics WHERE archived=0 ORDER BY kind, title COLLATE NOCASE`,
      )
      .all()
    send(
      200,
      rows.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        kind: t.kind,
        imageStub: true,
        wordCount: db
          .prepare(
            `SELECT count(*) AS n FROM vocab_words WHERE topicId=? AND archived=0`,
          )
          .get(t.id).n,
        subtopicCount: db
          .prepare(
            `SELECT count(*) AS n FROM vocab_subtopics WHERE topicId=? AND archived=0`,
          )
          .get(t.id).n,
        created: t.created,
        updated: t.updated,
      })),
    )
    return true
  }

  if (path === '/api/vocab/topics' && req.method === 'POST') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const data = await body(req)
    const title = clean(data.title, 120)
    const description = clean(data.description, 500)
    const kind = clean(data.kind, 20) || 'main'
    if (!title) fail(400, 'Укажите название темы')
    if (!KINDS.has(kind)) fail(400, 'Некорректный тип темы')
    const now = new Date().toISOString()
    const id = randomUUID()
    db.prepare(
      `INSERT INTO vocab_topics
       (id, title, description, kind, createdBy, created, updated, archived)
       VALUES (?,?,?,?,?,?,?,0)`,
    ).run(id, title, description, kind, user.id, now, now)
    send(201, {
      id,
      title,
      description,
      kind,
      imageStub: true,
      created: now,
      updated: now,
    })
    return true
  }

  const topicOne = /^\/api\/vocab\/topics\/([^/]+)$/.exec(path)
  if (topicOne) {
    const id = topicOne[1]
    const row = db.prepare('SELECT * FROM vocab_topics WHERE id=?').get(id)
    if (!row || row.archived) fail(404, 'Тема не найдена')
    if (req.method === 'GET') {
      if (!staff(user)) fail(403, 'Нет доступа')
      const subtopics = db
        .prepare(
          `SELECT * FROM vocab_subtopics WHERE topicId=? AND archived=0
           ORDER BY title COLLATE NOCASE`,
        )
        .all(id)
        .map((s) => ({
          id: s.id,
          topicId: s.topicId,
          title: s.title,
          description: s.description,
          imageStub: true,
          wordCount: db
            .prepare(
              `SELECT count(*) AS n FROM vocab_words WHERE subtopicId=? AND archived=0`,
            )
            .get(s.id).n,
          created: s.created,
          updated: s.updated,
        }))
      send(200, {
        id: row.id,
        title: row.title,
        description: row.description,
        kind: row.kind,
        imageStub: true,
        subtopics,
        created: row.created,
        updated: row.updated,
      })
      return true
    }
    if (req.method === 'PATCH') {
      if (!staff(user)) fail(403, 'Нет доступа')
      const data = await body(req)
      const title =
        data.title !== undefined ? clean(data.title, 120) : row.title
      const description =
        data.description !== undefined
          ? clean(data.description, 500)
          : row.description
      const kind =
        data.kind !== undefined ? clean(data.kind, 20) : row.kind
      if (!title) fail(400, 'Укажите название темы')
      if (!KINDS.has(kind)) fail(400, 'Некорректный тип темы')
      const updated = new Date().toISOString()
      db.prepare(
        `UPDATE vocab_topics SET title=?, description=?, kind=?, updated=? WHERE id=?`,
      ).run(title, description, kind, updated, id)
      send(200, {
        id,
        title,
        description,
        kind,
        imageStub: true,
        created: row.created,
        updated,
      })
      return true
    }
    if (req.method === 'DELETE') {
      if (!staff(user)) fail(403, 'Нет доступа')
      db.prepare(
        `UPDATE vocab_topics SET archived=1, updated=? WHERE id=?`,
      ).run(new Date().toISOString(), id)
      send(200, { ok: true })
      return true
    }
  }

  const topicSubs = /^\/api\/vocab\/topics\/([^/]+)\/subtopics$/.exec(path)
  if (topicSubs && req.method === 'POST') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const topicId = topicSubs[1]
    const topic = db.prepare('SELECT * FROM vocab_topics WHERE id=?').get(topicId)
    if (!topic || topic.archived) fail(404, 'Тема не найдена')
    const data = await body(req)
    const title = clean(data.title, 120)
    const description = clean(data.description, 500)
    if (!title) fail(400, 'Укажите название подтемы')
    const now = new Date().toISOString()
    const id = randomUUID()
    db.prepare(
      `INSERT INTO vocab_subtopics
       (id, topicId, title, description, createdBy, created, updated, archived)
       VALUES (?,?,?,?,?,?,?,0)`,
    ).run(id, topicId, title, description, user.id, now, now)
    send(201, {
      id,
      topicId,
      title,
      description,
      imageStub: true,
      created: now,
      updated: now,
    })
    return true
  }

  const subOne = /^\/api\/vocab\/subtopics\/([^/]+)$/.exec(path)
  if (subOne) {
    const id = subOne[1]
    const row = db.prepare('SELECT * FROM vocab_subtopics WHERE id=?').get(id)
    if (!row || row.archived) fail(404, 'Подтема не найдена')
    if (req.method === 'PATCH') {
      if (!staff(user)) fail(403, 'Нет доступа')
      const data = await body(req)
      const title =
        data.title !== undefined ? clean(data.title, 120) : row.title
      const description =
        data.description !== undefined
          ? clean(data.description, 500)
          : row.description
      if (!title) fail(400, 'Укажите название подтемы')
      const updated = new Date().toISOString()
      db.prepare(
        `UPDATE vocab_subtopics SET title=?, description=?, updated=? WHERE id=?`,
      ).run(title, description, updated, id)
      send(200, {
        id,
        topicId: row.topicId,
        title,
        description,
        imageStub: true,
        created: row.created,
        updated,
      })
      return true
    }
    if (req.method === 'DELETE') {
      if (!staff(user)) fail(403, 'Нет доступа')
      db.prepare(
        `UPDATE vocab_subtopics SET archived=1, updated=? WHERE id=?`,
      ).run(new Date().toISOString(), id)
      send(200, { ok: true })
      return true
    }
  }

  // ---- Collections ----
  if (path === '/api/vocab/collections' && req.method === 'GET') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const rows = db
      .prepare(
        `SELECT * FROM vocab_collections WHERE archived=0 ORDER BY updated DESC`,
      )
      .all()
    send(
      200,
      rows.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        tags: parseJson(c.tags, []),
        imageStub: true,
        wordCount: db
          .prepare(
            `SELECT count(*) AS n FROM vocab_collection_words WHERE collectionId=?`,
          )
          .get(c.id).n,
        wordIds: db
          .prepare(
            `SELECT wordId FROM vocab_collection_words WHERE collectionId=?
             ORDER BY sortOrder, wordId`,
          )
          .all(c.id)
          .map((r) => r.wordId),
        created: c.created,
        updated: c.updated,
      })),
    )
    return true
  }

  if (path === '/api/vocab/collections' && req.method === 'POST') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const data = await body(req)
    const title = clean(data.title, 120)
    const description = clean(data.description, 500)
    const tags = Array.isArray(data.tags)
      ? data.tags.map((t) => clean(String(t), 40)).filter(Boolean).slice(0, 12)
      : []
    if (!title) fail(400, 'Укажите название коллекции')
    const now = new Date().toISOString()
    const id = randomUUID()
    db.prepare(
      `INSERT INTO vocab_collections
       (id, title, description, tags, createdBy, created, updated, archived)
       VALUES (?,?,?,?,?,?,?,0)`,
    ).run(id, title, description, JSON.stringify(tags), user.id, now, now)
    if (Array.isArray(data.wordIds))
      replaceLinkRows(db, 'vocab_collection_words', 'collectionId', id, data.wordIds)
    send(201, {
      id,
      title,
      description,
      tags,
      imageStub: true,
      wordIds: data.wordIds || [],
      created: now,
      updated: now,
    })
    return true
  }

  const colOne = /^\/api\/vocab\/collections\/([^/]+)$/.exec(path)
  if (colOne) {
    const id = colOne[1]
    const row = db.prepare('SELECT * FROM vocab_collections WHERE id=?').get(id)
    if (!row || row.archived) fail(404, 'Коллекция не найдена')
    if (req.method === 'GET') {
      if (!staff(user)) fail(403, 'Нет доступа')
      send(200, {
        id: row.id,
        title: row.title,
        description: row.description,
        tags: parseJson(row.tags, []),
        imageStub: true,
        wordIds: db
          .prepare(
            `SELECT wordId FROM vocab_collection_words WHERE collectionId=?
             ORDER BY sortOrder, wordId`,
          )
          .all(id)
          .map((r) => r.wordId),
        created: row.created,
        updated: row.updated,
      })
      return true
    }
    if (req.method === 'PATCH') {
      if (!staff(user)) fail(403, 'Нет доступа')
      const data = await body(req)
      const title =
        data.title !== undefined ? clean(data.title, 120) : row.title
      const description =
        data.description !== undefined
          ? clean(data.description, 500)
          : row.description
      const tags =
        data.tags !== undefined
          ? (Array.isArray(data.tags) ? data.tags : [])
              .map((t) => clean(String(t), 40))
              .filter(Boolean)
              .slice(0, 12)
          : parseJson(row.tags, [])
      if (!title) fail(400, 'Укажите название коллекции')
      const updated = new Date().toISOString()
      db.prepare(
        `UPDATE vocab_collections SET title=?, description=?, tags=?, updated=? WHERE id=?`,
      ).run(title, description, JSON.stringify(tags), updated, id)
      if (Array.isArray(data.wordIds))
        replaceLinkRows(db, 'vocab_collection_words', 'collectionId', id, data.wordIds)
      send(200, {
        id,
        title,
        description,
        tags,
        imageStub: true,
        wordIds: db
          .prepare(
            `SELECT wordId FROM vocab_collection_words WHERE collectionId=?
             ORDER BY sortOrder, wordId`,
          )
          .all(id)
          .map((r) => r.wordId),
        created: row.created,
        updated,
      })
      return true
    }
    if (req.method === 'DELETE') {
      if (!staff(user)) fail(403, 'Нет доступа')
      db.prepare(
        `UPDATE vocab_collections SET archived=1, updated=? WHERE id=?`,
      ).run(new Date().toISOString(), id)
      send(200, { ok: true })
      return true
    }
  }

  const colWords = /^\/api\/vocab\/collections\/([^/]+)\/words$/.exec(path)
  if (colWords && req.method === 'PUT') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const id = colWords[1]
    const row = db.prepare('SELECT * FROM vocab_collections WHERE id=?').get(id)
    if (!row || row.archived) fail(404, 'Коллекция не найдена')
    const data = await body(req)
    if (!Array.isArray(data.wordIds)) fail(400, 'Нужен список wordIds')
    replaceLinkRows(db, 'vocab_collection_words', 'collectionId', id, data.wordIds)
    const updated = new Date().toISOString()
    db.prepare(`UPDATE vocab_collections SET updated=? WHERE id=?`).run(updated, id)
    send(200, { ok: true, wordIds: data.wordIds, updated })
    return true
  }

  // ---- Lesson words (existing schedule lessons) ----
  if (path === '/api/vocab/lesson-packs' && req.method === 'GET') {
    if (!staff(user)) fail(403, 'Нет доступа')
    let lessons = db
      .prepare(
        `SELECT l.* FROM lessons l JOIN users u ON l.studentId=u.id
         WHERE u.archived=0 ORDER BY l.date DESC, l.start DESC`,
      )
      .all()
    if (!privileged(user))
      lessons = lessons.filter((l) => l.teacherId === user.id)
    send(
      200,
      lessons.map((l) => {
        const wordIds = db
          .prepare(
            `SELECT wordId FROM vocab_lesson_words WHERE lessonId=?
             ORDER BY sortOrder, wordId`,
          )
          .all(l.id)
          .map((r) => r.wordId)
        return {
          id: l.id,
          title: l.title,
          date: l.date,
          start: l.start,
          end: l.end,
          studentId: l.studentId,
          teacherId: l.teacherId,
          wordIds,
          wordCount: wordIds.length,
          imageStub: true,
        }
      }),
    )
    return true
  }

  const lessonWords = /^\/api\/vocab\/lessons\/([^/]+)\/words$/.exec(path)
  if (lessonWords) {
    const lessonId = lessonWords[1]
    if (req.method === 'GET') {
      const lesson = db.prepare('SELECT * FROM lessons WHERE id=?').get(lessonId)
      if (!lesson) fail(404, 'Занятие не найдено')
      const allowed =
        (staff(user) &&
          (privileged(user) || lesson.teacherId === user.id)) ||
        lesson.studentId === user.id
      if (!allowed) fail(403, 'Нет доступа')
      const wordIds = db
        .prepare(
          `SELECT wordId FROM vocab_lesson_words WHERE lessonId=?
           ORDER BY sortOrder, wordId`,
        )
        .all(lessonId)
        .map((r) => r.wordId)
      send(200, { lessonId, wordIds })
      return true
    }
    if (req.method === 'PUT') {
      canManageLesson(db, user, lessonId)
      const data = await body(req)
      if (!Array.isArray(data.wordIds)) fail(400, 'Нужен список wordIds')
      replaceLinkRows(db, 'vocab_lesson_words', 'lessonId', lessonId, data.wordIds)
      send(200, { ok: true, wordIds: data.wordIds })
      return true
    }
  }

  // ---- Groups ----
  if (path === '/api/vocab/groups' && req.method === 'GET') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const rows = privileged(user)
      ? db.prepare(`SELECT * FROM vocab_groups ORDER BY title COLLATE NOCASE`).all()
      : db
          .prepare(
            `SELECT * FROM vocab_groups WHERE teacherId=? ORDER BY title COLLATE NOCASE`,
          )
          .all(user.id)
    send(
      200,
      rows.map((g) => ({
        id: g.id,
        teacherId: g.teacherId,
        title: g.title,
        studentIds: groupMemberIds(db, g.id),
        created: g.created,
        updated: g.updated,
      })),
    )
    return true
  }

  if (path === '/api/vocab/groups' && req.method === 'POST') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const data = await body(req)
    const title = clean(data.title, 80)
    if (!title) fail(400, 'Укажите название группы')
    const now = new Date().toISOString()
    const id = randomUUID()
    db.prepare(
      `INSERT INTO vocab_groups (id, teacherId, title, created, updated)
       VALUES (?,?,?,?,?)`,
    ).run(id, user.id, title, now, now)
    const studentIds = Array.isArray(data.studentIds) ? data.studentIds : []
    const insert = db.prepare(
      `INSERT INTO vocab_group_members (groupId, studentId) VALUES (?,?)`,
    )
    for (const sid of studentIds) {
      const u = db
        .prepare(`SELECT id, teacherId, roles FROM users WHERE id=? AND archived=0`)
        .get(sid)
      if (!u || !parseJson(u.roles, []).includes('student')) continue
      if (!privileged(user) && u.teacherId !== user.id) continue
      insert.run(id, sid)
    }
    send(201, {
      id,
      teacherId: user.id,
      title,
      studentIds: groupMemberIds(db, id),
      created: now,
      updated: now,
    })
    return true
  }

  const groupOne = /^\/api\/vocab\/groups\/([^/]+)$/.exec(path)
  if (groupOne) {
    const id = groupOne[1]
    const row = db.prepare('SELECT * FROM vocab_groups WHERE id=?').get(id)
    if (!row) fail(404, 'Группа не найдена')
    if (!privileged(user) && row.teacherId !== user.id) fail(403, 'Нет доступа')
    if (req.method === 'PATCH') {
      const data = await body(req)
      const title =
        data.title !== undefined ? clean(data.title, 80) : row.title
      if (!title) fail(400, 'Укажите название группы')
      const updated = new Date().toISOString()
      db.prepare(`UPDATE vocab_groups SET title=?, updated=? WHERE id=?`).run(
        title,
        updated,
        id,
      )
      if (Array.isArray(data.studentIds)) {
        db.prepare(`DELETE FROM vocab_group_members WHERE groupId=?`).run(id)
        const insert = db.prepare(
          `INSERT INTO vocab_group_members (groupId, studentId) VALUES (?,?)`,
        )
        for (const sid of data.studentIds) {
          const u = db
            .prepare(
              `SELECT id, teacherId, roles FROM users WHERE id=? AND archived=0`,
            )
            .get(sid)
          if (!u || !parseJson(u.roles, []).includes('student')) continue
          if (!privileged(user) && u.teacherId !== row.teacherId) continue
          insert.run(id, sid)
        }
      }
      send(200, {
        id,
        teacherId: row.teacherId,
        title,
        studentIds: groupMemberIds(db, id),
        created: row.created,
        updated,
      })
      return true
    }
    if (req.method === 'DELETE') {
      db.prepare(`DELETE FROM vocab_group_members WHERE groupId=?`).run(id)
      db.prepare(`DELETE FROM vocab_groups WHERE id=?`).run(id)
      send(200, { ok: true })
      return true
    }
  }

  // ---- Assignments ----
  if (path === '/api/vocab/assignments' && req.method === 'GET') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const rows = privileged(user)
      ? db.prepare(`SELECT * FROM vocab_assignments ORDER BY created DESC`).all()
      : db
          .prepare(
            `SELECT * FROM vocab_assignments WHERE teacherId=? ORDER BY created DESC`,
          )
          .all(user.id)
    send(200, rows.map(publicAssignment))
    return true
  }

  if (path === '/api/vocab/assignments' && req.method === 'POST') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const data = await body(req)
    const sourceType = clean(data.sourceType, 20)
    const sourceId =
      sourceType === 'words'
        ? JSON.stringify(
            (Array.isArray(data.wordIds) ? data.wordIds : []).filter(
              (id) => typeof id === 'string',
            ),
          )
        : clean(data.sourceId, 80)
    const targetType = clean(data.targetType, 20)
    const targetIds = Array.isArray(data.targetIds)
      ? data.targetIds
      : data.targetId
        ? [data.targetId]
        : []
    if (!['topic', 'subtopic', 'collection', 'lesson', 'words'].includes(sourceType))
      fail(400, 'Некорректный источник')
    if (!['student', 'group'].includes(targetType))
      fail(400, 'Некорректный получатель')
    if (!targetIds.length) fail(400, 'Выберите учеников или группы')
    if (sourceType !== 'words' && !sourceId) fail(400, 'Укажите источник')
    let exercises = Array.isArray(data.exercises)
      ? data.exercises.filter((e) => EXERCISES.has(e))
      : ALL_EXERCISES
    if (!exercises.length) exercises = ALL_EXERCISES

    // validate source exists
    if (sourceType === 'topic') {
      const t = db.prepare('SELECT id FROM vocab_topics WHERE id=? AND archived=0').get(sourceId)
      if (!t) fail(404, 'Тема не найдена')
    } else if (sourceType === 'subtopic') {
      const s = db.prepare('SELECT id FROM vocab_subtopics WHERE id=? AND archived=0').get(sourceId)
      if (!s) fail(404, 'Подтема не найдена')
    } else if (sourceType === 'collection') {
      const c = db.prepare('SELECT id FROM vocab_collections WHERE id=? AND archived=0').get(sourceId)
      if (!c) fail(404, 'Коллекция не найдена')
    } else if (sourceType === 'lesson') {
      canManageLesson(db, user, sourceId)
    }

    const now = new Date().toISOString()
    const created = []
    const insert = db.prepare(
      `INSERT INTO vocab_assignments
       (id, teacherId, targetType, targetId, sourceType, sourceId, exercises, created, updated)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    for (const targetId of targetIds) {
      if (targetType === 'student') {
        const u = db
          .prepare(`SELECT id, teacherId, roles FROM users WHERE id=? AND archived=0`)
          .get(targetId)
        if (!u || !parseJson(u.roles, []).includes('student')) continue
        if (!privileged(user) && u.teacherId !== user.id) continue
      } else {
        const g = db.prepare('SELECT * FROM vocab_groups WHERE id=?').get(targetId)
        if (!g) continue
        if (!privileged(user) && g.teacherId !== user.id) continue
      }
      const id = randomUUID()
      insert.run(
        id,
        user.id,
        targetType,
        targetId,
        sourceType,
        sourceId,
        JSON.stringify(exercises),
        now,
        now,
      )
      created.push(
        publicAssignment(
          db.prepare('SELECT * FROM vocab_assignments WHERE id=?').get(id),
        ),
      )
    }
    if (!created.length) fail(400, 'Не удалось назначить')
    send(201, { assignments: created })
    return true
  }

  const asgOne = /^\/api\/vocab\/assignments\/([^/]+)$/.exec(path)
  if (asgOne && req.method === 'DELETE') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const id = asgOne[1]
    const row = db.prepare('SELECT * FROM vocab_assignments WHERE id=?').get(id)
    if (!row) fail(404, 'Назначение не найдено')
    if (!privileged(user) && row.teacherId !== user.id) fail(403, 'Нет доступа')
    db.prepare('DELETE FROM vocab_assignments WHERE id=?').run(id)
    send(200, { ok: true })
    return true
  }

  // ---- Words list/create ----
  if (path === '/api/vocab' && req.method === 'GET') {
    if (staff(user)) {
      const rows = db
        .prepare(
          `SELECT id, word, transcription, translation, level, pos, shortMeaning,
                  exampleEn, exampleRu, topicId, subtopicId, archived, audioMime,
                  createdBy, created, updated,
                  CASE WHEN audio IS NOT NULL AND length(audio) > 0 THEN 1 ELSE 0 END AS hasAudioFlag
           FROM vocab_words WHERE archived=0
           ORDER BY word COLLATE NOCASE, id`,
        )
        .all()
      send(
        200,
        rows.map((row) =>
          publicWord(row, {
            lessonIds: db
              .prepare(`SELECT lessonId FROM vocab_lesson_words WHERE wordId=?`)
              .all(row.id)
              .map((r) => r.lessonId),
            collectionIds: db
              .prepare(
                `SELECT collectionId FROM vocab_collection_words WHERE wordId=?`,
              )
              .all(row.id)
              .map((r) => r.collectionId),
          }),
        ),
      )
      return true
    }
    send(200, visibleCatalog(db, user).words)
    return true
  }

  if (path === '/api/vocab' && req.method === 'POST') {
    if (!staff(user)) fail(403, 'Нет доступа')
    const data = await body(req, 2_000_000)
    const fields = wordFieldsFromBody(data)
    if (fields.topicId) {
      const t = db
        .prepare('SELECT id FROM vocab_topics WHERE id=? AND archived=0')
        .get(fields.topicId)
      if (!t) fail(400, 'Тема не найдена')
    }
    if (fields.subtopicId) {
      const s = db
        .prepare('SELECT id, topicId FROM vocab_subtopics WHERE id=? AND archived=0')
        .get(fields.subtopicId)
      if (!s) fail(400, 'Подтема не найдена')
      if (fields.topicId && s.topicId !== fields.topicId)
        fail(400, 'Подтема не относится к теме')
      if (!fields.topicId) fields.topicId = s.topicId
    }
    let audio = null
    let audioMime = ''
    if (data.tts === true) {
      const spoken = await synthesizeSpeech(fields.word)
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
       (id, word, transcription, translation, audio, audioMime, createdBy, created, updated,
        level, pos, shortMeaning, exampleEn, exampleRu, topicId, subtopicId, archived)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
    ).run(
      id,
      fields.word,
      fields.transcription,
      fields.translation,
      audio,
      audioMime,
      user.id,
      now,
      now,
      fields.level,
      fields.pos,
      fields.shortMeaning,
      fields.exampleEn,
      fields.exampleRu,
      fields.topicId,
      fields.subtopicId,
    )
    if (Array.isArray(data.lessonIds)) {
      for (const lessonId of data.lessonIds) {
        canManageLesson(db, user, lessonId)
        const max = db
          .prepare(
            `SELECT coalesce(max(sortOrder),-1) AS n FROM vocab_lesson_words WHERE lessonId=?`,
          )
          .get(lessonId).n
        db.prepare(
          `INSERT OR IGNORE INTO vocab_lesson_words (lessonId, wordId, sortOrder) VALUES (?,?,?)`,
        ).run(lessonId, id, max + 1)
      }
    }
    if (Array.isArray(data.collectionIds)) {
      for (const collectionId of data.collectionIds) {
        const c = db
          .prepare('SELECT id FROM vocab_collections WHERE id=? AND archived=0')
          .get(collectionId)
        if (!c) continue
        const max = db
          .prepare(
            `SELECT coalesce(max(sortOrder),-1) AS n FROM vocab_collection_words WHERE collectionId=?`,
          )
          .get(collectionId).n
        db.prepare(
          `INSERT OR IGNORE INTO vocab_collection_words (collectionId, wordId, sortOrder) VALUES (?,?,?)`,
        ).run(collectionId, id, max + 1)
      }
    }
    send(
      201,
      publicWord(db.prepare('SELECT * FROM vocab_words WHERE id=?').get(id)),
    )
    return true
  }

  const one = /^\/api\/vocab\/([^/]+)$/.exec(path)
  if (one) {
    const id = one[1]
    // skip reserved segments already handled
    if (
      [
        'topics',
        'subtopics',
        'collections',
        'groups',
        'assignments',
        'lesson-packs',
        'lessons',
        'me',
      ].includes(id)
    ) {
      fail(404, 'Не найдено')
    }
    const row = db.prepare('SELECT * FROM vocab_words WHERE id=?').get(id)
    if (!row || row.archived) fail(404, 'Слово не найдено')

    if (req.method === 'GET') {
      if (!staff(user)) {
        const catalog = visibleCatalog(db, user)
        if (!catalog.words.some((w) => w.id === id)) fail(403, 'Нет доступа')
      }
      send(
        200,
        publicWord(row, {
          lessonIds: db
            .prepare(`SELECT lessonId FROM vocab_lesson_words WHERE wordId=?`)
            .all(id)
            .map((r) => r.lessonId),
          collectionIds: db
            .prepare(
              `SELECT collectionId FROM vocab_collection_words WHERE wordId=?`,
            )
            .all(id)
            .map((r) => r.collectionId),
        }),
      )
      return true
    }

    if (req.method === 'PATCH') {
      if (!staff(user)) fail(403, 'Нет доступа')
      const data = await body(req, 2_000_000)
      const fields = wordFieldsFromBody(data, row)
      let audio = row.audio
      let audioMime = row.audioMime || ''
      if (data.tts === true) {
        const spoken = await synthesizeSpeech(fields.word)
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
         audio=?, audioMime=?, updated=?, level=?, pos=?, shortMeaning=?,
         exampleEn=?, exampleRu=?, topicId=?, subtopicId=? WHERE id=?`,
      ).run(
        fields.word,
        fields.transcription,
        fields.translation,
        audio,
        audioMime,
        updated,
        fields.level,
        fields.pos,
        fields.shortMeaning,
        fields.exampleEn,
        fields.exampleRu,
        fields.topicId,
        fields.subtopicId,
        id,
      )
      if (Array.isArray(data.lessonIds)) {
        db.prepare(`DELETE FROM vocab_lesson_words WHERE wordId=?`).run(id)
        for (const lessonId of data.lessonIds) {
          canManageLesson(db, user, lessonId)
          db.prepare(
            `INSERT INTO vocab_lesson_words (lessonId, wordId, sortOrder) VALUES (?,?,0)`,
          ).run(lessonId, id)
        }
      }
      if (Array.isArray(data.collectionIds)) {
        db.prepare(`DELETE FROM vocab_collection_words WHERE wordId=?`).run(id)
        for (const collectionId of data.collectionIds) {
          const c = db
            .prepare(
              'SELECT id FROM vocab_collections WHERE id=? AND archived=0',
            )
            .get(collectionId)
          if (!c) continue
          db.prepare(
            `INSERT INTO vocab_collection_words (collectionId, wordId, sortOrder) VALUES (?,?,0)`,
          ).run(collectionId, id)
        }
      }
      send(
        200,
        publicWord(db.prepare('SELECT * FROM vocab_words WHERE id=?').get(id), {
          lessonIds: db
            .prepare(`SELECT lessonId FROM vocab_lesson_words WHERE wordId=?`)
            .all(id)
            .map((r) => r.lessonId),
          collectionIds: db
            .prepare(
              `SELECT collectionId FROM vocab_collection_words WHERE wordId=?`,
            )
            .all(id)
            .map((r) => r.collectionId),
        }),
      )
      return true
    }

    if (req.method === 'DELETE') {
      if (!staff(user)) fail(403, 'Нет доступа')
      db.prepare(
        `UPDATE vocab_words SET archived=1, updated=? WHERE id=?`,
      ).run(new Date().toISOString(), id)
      send(200, { ok: true })
      return true
    }
  }

  const audioPath = /^\/api\/vocab\/([^/]+)\/audio$/.exec(path)
  if (audioPath && req.method === 'GET') {
    const id = audioPath[1]
    if (!staff(user)) {
      const catalog = visibleCatalog(db, user)
      if (!catalog.words.some((w) => w.id === id)) fail(403, 'Нет доступа')
    }
    const row = db
      .prepare('SELECT audio, audioMime FROM vocab_words WHERE id=?')
      .get(id)
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
