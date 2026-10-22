import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword } from './store.mjs'
import { applyAttempt, statusOf, studentMetrics, FORMATS } from './lexiconMetrics.mjs'

const writing = FORMATS.assemble.gain
const play = (steps) => {
  let s = null
  const trace = []
  for (const [day, correct, extra = {}] of steps) {
    s = applyAttempt(s, { gain: writing, correct, day, ...extra })
    trace.push(Math.round(s.mastery))
  }
  return { s, trace }
}

test('mastery grows with spaced practice like the "achieve" example', () => {
  const { s, trace } = play([
    ['2026-10-01', true],
    ['2026-10-01', true],
    ['2026-10-01', true],
    ['2026-10-04', true],
    ['2026-10-04', false],
    ['2026-10-11', true],
    ['2026-10-25', true],
  ])
  // First day stops at 40, a mistake costs a share, not the history.
  assert.deepEqual(trace, [25, 38, 40, 68, 58, 89, 100])
  assert.equal(statusOf(s), 'mastered')
  assert.equal(s.firstDay, '2026-10-01')
  assert.deepEqual([s.correct, s.wrong], [6, 1])
})

test('mastery edge cases', () => {
  // 20 correct answers in one day stay within the first stage.
  const crammed = play(Array.from({ length: 20 }, () => ['2026-10-01', true]))
  assert.equal(crammed.s.mastery, 40)
  assert.equal(statusOf(crammed.s), 'reviewing')
  // Practice on consecutive days alone is not enough to be mastered.
  const daily = play(
    ['01', '02', '03', '04', '05'].flatMap((d) => [
      [`2026-10-${d}`, true],
      [`2026-10-${d}`, true],
    ]),
  )
  assert(daily.s.mastery < 90)
  // Five mistakes in a row: down, never below zero.
  const wrong = play(Array.from({ length: 5 }, () => ['2026-10-01', false]))
  assert.equal(wrong.s.mastery, 0)
  assert.equal(statusOf(wrong.s), 'learning')
  // One mistake after a mastered word moves it back to reviewing only.
  const slip = applyAttempt({ ...play([['2026-10-01', true]]).s, mastery: 95, stage: 4 }, {
    gain: writing,
    correct: false,
    day: '2026-11-01',
  })
  assert(slip.mastery >= 80 && slip.mastery < 90)
  // Correct with a hint counts for less and confirms nothing.
  const hinted = play([['2026-10-01', true, { hinted: true }]]).s
  assert.equal(hinted.mastery, 12.5)
  assert.equal(hinted.stage, 0)
  // Activity-only formats (cards, memory) do not move mastery.
  const seen = applyAttempt(null, { gain: 0, correct: true, day: '2026-10-01' })
  assert.deepEqual([seen.mastery, seen.correct, seen.wrong], [0, 0, 0])
  assert.equal(statusOf(seen), 'learning')
  assert.equal(statusOf(null), 'new')
})

test('metrics: words, new words, streak, activity, skills', () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-metrics-'))
  const { db, server } = createApp({ dbPath: join(dir, 'test.sqlite') })
  try {
    db.prepare(
      "INSERT INTO users (id,name,email,password,roles,timeZone) VALUES ('s','s','s@x.test','x','[\"student\"]','Asia/Vladivostok')",
    ).run()
    const insert = db.prepare(
      `INSERT INTO lexicon_attempts (id, userId, termId, format, skill, correct, hinted, sourceType, sourceId, at, day)
       VALUES (?, 's', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    let n = 0
    const add = (day, termId, format, correct, extra = {}) =>
      insert.run(
        randomUUID(),
        termId,
        format,
        FORMATS[format].skill,
        correct ? 1 : 0,
        extra.hinted ? 1 : 0,
        extra.sourceType || '',
        extra.sourceId || '',
        `${day}T00:00:${String(n++ % 60).padStart(2, '0')}.${String(n).padStart(3, '0')}Z`,
        day,
      )
    const state = db.prepare(
      `INSERT INTO lexicon_progress (userId, termId, status, mastery, wrong, firstDay, lastDay, updated)
       VALUES ('s', ?, '', ?, ?, ?, ?, '')`,
    )
    state.run('a', 95, 0, '2026-09-01', '2026-10-20')
    state.run('b', 60, 1, '2026-10-18', '2026-10-21')
    state.run('c', 10, 2, '2026-10-21', '2026-10-21')
    state.run('d', 0, 0, '2026-10-22', '2026-10-22')
    // Streak 19–21 (yesterday), today not practised yet; a gap on the 17th.
    add('2026-10-16', 'a', 'assemble', true)
    for (const day of ['2026-10-19', '2026-10-20', '2026-10-21'])
      add(day, 'b', 'choose-translation', true, { sourceType: 'homework', sourceId: 'h1' })
    // Writing: "achieve"-style window 0,0,1,1,1 → newer answers weigh more.
    for (const ok of [false, false, true, true, true]) add('2026-10-21', 'c', 'assemble', ok)
    add('2026-10-21', 'c', 'find-word', true, { hinted: true })
    add('2026-10-21', 'c', 'cards', true)

    // 2026-10-22 08:00 in Vladivostok is still the 21st in Moscow; the
    // student's zone decides "today".
    const now = new Date('2026-10-21T22:00:00Z')
    const m = studentMetrics(db, db.prepare("SELECT * FROM users WHERE id='s'").get(), { now })
    assert.equal(m.today, '2026-10-22')
    assert.equal(m.from, '2026-10-16')
    assert.deepEqual(m.words, { mastered: 1, reviewing: 1, learning: 2 })
    assert.equal(m.newWords, 3)
    assert.deepEqual(m.streak, { current: 3, today: false })
    assert.deepEqual(
      m.activity.map((d) => [d.day.slice(8), d.attempts, d.words]),
      [['16', 1, 1], ['17', 0, 0], ['18', 0, 0], ['19', 1, 1], ['20', 1, 1], ['21', 8, 2], ['22', 0, 0]],
    )
    // (1+0.9+0.8)/4 for c; a: 1/1 → (67.5+100)/2.
    assert.deepEqual(m.skills.writing, { value: 84, words: 2, attempts: 6, lowSample: true })
    // Too few answers: no value instead of a misleading 100%.
    assert.deepEqual(m.skills.comprehension, { value: null, words: 1, attempts: 3, lowSample: true })
    assert.equal(m.skills.recall.value, null)
    assert.deepEqual(m.revisit.map((w) => w.mastery), [])

    // Source filter: only the homework's words and attempts.
    const hw = studentMetrics(db, { id: 's', timeZone: 'Asia/Vladivostok' }, {
      now,
      source: { type: 'homework', id: 'h1' },
    })
    assert.deepEqual(hw.words, { mastered: 0, reviewing: 1, learning: 0 })
    assert.equal(hw.newWords, 1)
    assert.equal(hw.activity.reduce((t, d) => t + d.attempts, 0), 3)
    // The streak is about the student, not the source.
    assert.equal(hw.streak.current, 3)

    // After midnight of a missed day the streak is over.
    const later = studentMetrics(db, { id: 's', timeZone: 'Asia/Vladivostok' }, {
      now: new Date('2026-10-23T01:00:00Z'),
    })
    assert.deepEqual(later.streak, { current: 0, today: false })
  } finally {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('attempts API: idempotent answers, formats, teacher access', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-metrics-api-'))
  const { server, db } = createApp({ dbPath: join(dir, 'test.sqlite') })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const password = randomBytes(18).toString('hex'),
    hash = await hashPassword(password)
  for (const [id, roles, teacher] of [
    ['owner', ['owner'], null],
    ['teacher', ['teacher'], null],
    ['other', ['teacher'], null],
    ['anna', ['student'], 'teacher'],
    ['boris', ['student'], 'other'],
  ])
    db.prepare(
      'INSERT INTO users (id,name,email,password,roles,teacherId) VALUES (?,?,?,?,?,?)',
    ).run(id, id, `${id}@example.test`, hash, JSON.stringify(roles), teacher)
  for (const [id, term] of [['t1', 'achieve'], ['t2', 'develop']])
    db.prepare(
      "INSERT INTO lexicon_terms (id, term, termKey, translation, transcription, updated) VALUES (?, ?, ?, 'перевод', '', '')",
    ).run(id, term, term)
  const request = async (path, method = 'GET', body, cookie = '') => {
    const res = await fetch(base + path, {
      method,
      headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: await res.json() }
  }
  const login = async (id) => {
    const res = await fetch(base + '/login', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${id}@example.test`, password }),
    })
    return res.headers.get('set-cookie').split(';')[0]
  }
  try {
    const anna = await login('anna'),
      teacher = await login('teacher'),
      other = await login('other'),
      owner = await login('owner'),
      boris = await login('boris')
    for (const bad of [
      { results: [{ termId: 't1', correct: true, format: 'chess' }] },
      { results: [{ termId: 't1', correct: true, id: 'x' }] },
      { results: [{ termId: 't1', correct: 1 }] },
    ])
      assert.equal((await request('/lexicon/me/progress', 'POST', bad, anna)).status, 400)
    const answer = {
      id: randomUUID(),
      termId: 't1',
      correct: true,
      format: 'assemble',
      sourceType: 'homework',
      sourceId: 'hw-1',
      sourceLabel: 'Неделя 1',
      sessionId: 'session-1',
    }
    const first = await request('/lexicon/me/progress', 'POST', { results: [answer] }, anna)
    assert.equal(first.status, 200)
    assert.deepEqual(first.body.statuses, { t1: 'learning' })
    // A resend of the same answer and a double tap count once.
    await request('/lexicon/me/progress', 'POST', { results: [answer, answer] }, anna)
    const rows = db.prepare("SELECT count(*) AS n FROM lexicon_attempts WHERE userId='anna'").get()
    assert.equal(rows.n, 1)
    assert.equal(
      db.prepare("SELECT mastery FROM lexicon_progress WHERE userId='anna' AND termId='t1'").get().mastery,
      25,
    )
    // Skips are mistakes; cards are activity only; old clients still work.
    await request(
      '/lexicon/me/progress',
      'POST',
      {
        results: [
          { id: randomUUID(), termId: 't2', correct: false, skipped: true, format: 'choose-translation' },
          { id: randomUUID(), termId: 't2', correct: true, format: 'cards' },
          { termId: 't2', correct: true },
          { id: randomUUID(), termId: 'gone', correct: true, format: 'assemble' },
        ],
      },
      anna,
    )
    const t2 = db.prepare("SELECT * FROM lexicon_progress WHERE userId='anna' AND termId='t2'").get()
    assert.deepEqual([t2.correct, t2.wrong, t2.mastery], [1, 1, 15])
    const skip = db
      .prepare("SELECT skill, correct, skipped FROM lexicon_attempts WHERE termId='t2' AND format='choose-translation'")
      .get()
    assert.deepEqual({ ...skip }, { skill: 'comprehension', correct: 0, skipped: 1 })

    const mine = await request('/lexicon/me/metrics', 'GET', undefined, anna)
    assert.equal(mine.status, 200)
    assert.equal(mine.body.timeZone, 'Europe/Moscow')
    assert.equal(mine.body.newWords, 2)
    assert.equal(mine.body.streak.current, 1)
    assert.equal(mine.body.activity.at(-1).attempts, 4)
    assert.equal((await request('/lexicon/me/metrics?days=5', 'GET', undefined, anna)).status, 400)

    // Teacher: own students only; managers see everyone; students none.
    const view = await request('/lexicon/students/anna/metrics?days=28', 'GET', undefined, teacher)
    assert.equal(view.status, 200)
    assert.equal(view.body.activity.length, 28)
    assert.deepEqual(view.body.sources, [{ type: 'homework', id: 'hw-1', label: 'Неделя 1' }])
    const filtered = await request(
      '/lexicon/students/anna/metrics?source=homework:hw-1',
      'GET',
      undefined,
      teacher,
    )
    assert.deepEqual(filtered.body.words, { mastered: 0, reviewing: 0, learning: 1 })
    assert.equal(
      (await request('/lexicon/students/anna/metrics?source=chess', 'GET', undefined, teacher)).status,
      400,
    )
    assert.equal((await request('/lexicon/students/anna/metrics', 'GET', undefined, other)).status, 403)
    assert.equal((await request('/lexicon/students/anna/metrics', 'GET', undefined, owner)).status, 200)
    assert.equal((await request('/lexicon/students/anna/metrics', 'GET', undefined, boris)).status, 403)
    assert.equal((await request('/lexicon/students/teacher/metrics', 'GET', undefined, owner)).status, 404)
  } finally {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
