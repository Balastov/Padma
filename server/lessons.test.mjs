import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword } from './store.mjs'
import { addDays, localDay } from './timezone.mjs'

const weekday = (day) => new Date(day + 'T12:00:00Z').getUTCDay() || 7

test('recurring lessons: rules, plan topics, statuses, conflicts and edits', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-lessons-'))
  const dbPath = join(dir, 'test.sqlite')
  const app = createApp({ dbPath })
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${app.server.address().port}/api`
  const password = randomBytes(20).toString('hex'),
    hash = await hashPassword(password)
  for (const [id, roles, teacher] of [
    ['teacher', ['teacher'], null],
    ['other', ['teacher'], null],
    ['student', ['student'], 'teacher'],
    ['second', ['student'], 'teacher'],
  ])
    app.db
      .prepare(
        'INSERT INTO users (id,name,email,password,roles,teacherId) VALUES (?,?,?,?,?,?)',
      )
      .run(id, id, id + '@example.test', hash, JSON.stringify(roles), teacher)
  const cookies = {}
  async function req(path, who, method = 'GET', data) {
    const res = await fetch(base + path, {
      method,
      headers: {
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        Cookie: cookies[who] || '',
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
    return { status: res.status, body: await res.json() }
  }
  const today = localDay(new Date())
  // A Monday three weeks ahead: all generated lessons are in the future.
  const monday = addDays(today, 22 - weekday(today))
  const lessonsOf = async (seriesId) =>
    (await req('/lessons', 'teacher')).body.filter(
      (l) => l.seriesId === seriesId,
    )
  try {
    for (const id of ['teacher', 'other', 'student', 'second']) {
      const r = await fetch(base + '/login', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:5173',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: id + '@example.test', password }),
      })
      cookies[id] = r.headers.get('set-cookie').split(';')[0]
    }

    // Two days with their own time, every two weeks, a package of 5 lessons.
    const created = await req('/lessons', 'teacher', 'POST', {
      studentId: 'student',
      date: monday,
      title: 'Свободная тема',
      recurrence: {
        everyWeeks: 2,
        days: [
          { weekday: 4, start: '17:00', end: '17:50' },
          { weekday: 1, start: '14:00', end: '14:50' },
        ],
        endType: 'count',
        count: 5,
        plan: ['Present Simple', 'Past Simple', 'Future'],
      },
    })
    assert.equal(created.status, 201)
    assert.deepEqual(
      created.body.map((l) => [l.date, l.start, l.end]),
      [
        [monday, '14:00', '14:50'],
        [addDays(monday, 3), '17:00', '17:50'],
        [addDays(monday, 14), '14:00', '14:50'],
        [addDays(monday, 17), '17:00', '17:50'],
        [addDays(monday, 28), '14:00', '14:50'],
      ],
    )
    assert.deepEqual(
      created.body.map((l) => l.title),
      [
        'Present Simple',
        'Past Simple',
        'Future',
        'Свободная тема',
        'Свободная тема',
      ],
    )
    const seriesId = created.body[0].seriesId
    assert.ok(seriesId)

    // Cancelled: topics shift right and the package is extended.
    assert.equal(
      (
        await req(`/lessons/${created.body[0].id}/status`, 'student', 'POST', {
          status: 'cancelled',
        })
      ).status,
      403,
    )
    assert.equal(
      (
        await req(`/lessons/${created.body[0].id}/status`, 'other', 'POST', {
          status: 'cancelled',
        })
      ).status,
      403,
    )
    assert.equal(
      (
        await req(`/lessons/${created.body[0].id}/status`, 'teacher', 'POST', {
          status: 'cancelled',
        })
      ).status,
      200,
    )
    let rows = await lessonsOf(seriesId)
    assert.equal(rows.length, 6)
    assert.deepEqual(
      rows.map((l) => [l.status, l.seq, l.title]),
      [
        ['cancelled', 0, 'Present Simple'],
        ['scheduled', 1, 'Present Simple'],
        ['scheduled', 2, 'Past Simple'],
        ['scheduled', 3, 'Future'],
        ['scheduled', 4, 'Свободная тема'],
        ['scheduled', 5, 'Свободная тема'],
      ],
    )
    assert.equal(rows[5].date, addDays(monday, 31))

    // No-show: topics shift too, but the lesson is used up.
    await req(`/lessons/${rows[1].id}/status`, 'teacher', 'POST', {
      status: 'noshow',
    })
    rows = await lessonsOf(seriesId)
    assert.equal(rows.length, 6)
    assert.deepEqual(rows.map((l) => l.title).slice(1, 4), [
      'Present Simple',
      'Present Simple',
      'Past Simple',
    ])

    // Restoring the cancelled lesson trims the extra lesson at the end.
    await req(`/lessons/${rows[0].id}/status`, 'teacher', 'POST', {
      status: 'scheduled',
    })
    rows = await lessonsOf(seriesId)
    assert.equal(rows.length, 5)
    assert.deepEqual(
      rows.map((l) => l.title),
      [
        'Present Simple',
        'Present Simple',
        'Past Simple',
        'Future',
        'Свободная тема',
      ],
    )

    // Only this lesson: moved and renamed; an empty title follows the plan again.
    const moved = await req(`/lessons/${rows[2].id}`, 'teacher', 'PATCH', {
      date: addDays(monday, 15),
      start: '10:00',
      end: '10:50',
      title: 'Speaking club',
      note: 'Перенос',
    })
    assert.equal(moved.status, 200)
    assert.equal(moved.body.customTitle, true)
    rows = await lessonsOf(seriesId)
    assert.deepEqual(
      rows.map((l) => l.title),
      [
        'Present Simple',
        'Present Simple',
        'Speaking club',
        'Past Simple',
        'Future',
      ],
    )
    await req(`/lessons/${rows[2].id}`, 'teacher', 'PATCH', {
      ...rows[2],
      title: '',
    })
    rows = await lessonsOf(seriesId)
    assert.equal(rows[2].title, 'Past Simple')
    assert.equal(rows[2].start, '10:00')

    // Deleting one lesson shifts topics and keeps the package size.
    const deletedId = rows[0].id
    assert.equal(
      (await req(`/lessons/${deletedId}`, 'teacher', 'DELETE', {})).status,
      200,
    )
    rows = await lessonsOf(seriesId)
    assert.equal(rows.length, 5)
    assert.ok(!rows.some((l) => l.id === deletedId))
    assert.equal(rows[0].title, 'Present Simple')
    assert.equal(rows.at(-1).date, addDays(monday, 31))

    // Conflicts: 409 with dates, then skip or overlap.
    const clash = {
      studentId: 'second',
      date: monday,
      recurrence: {
        everyWeeks: 1,
        days: [{ weekday: 4, start: '17:30', end: '18:20' }],
        endType: 'until',
        until: addDays(monday, 20),
      },
    }
    const refused = await req('/lessons', 'teacher', 'POST', clash)
    assert.equal(refused.status, 409)
    // The no-show on day 3 does not block the time.
    assert.deepEqual(
      refused.body.conflicts.map((c) => [c.date, c.busyStart]),
      [[addDays(monday, 17), '17:00']],
    )
    assert.equal(
      (await req('/lessons', 'teacher')).body.filter(
        (l) => l.studentId === 'second',
      ).length,
      0,
    )
    const skipped = await req('/lessons', 'teacher', 'POST', {
      ...clash,
      conflicts: 'skip',
    })
    assert.deepEqual(
      skipped.body.map((l) => l.date),
      [addDays(monday, 3), addDays(monday, 10)],
    )
    assert.equal(
      (
        await req(`/lessons/${skipped.body[0].id}`, 'teacher', 'DELETE', {
          scope: 'all',
        })
      ).status,
      200,
    )
    const overlapped = await req('/lessons', 'teacher', 'POST', {
      ...clash,
      conflicts: 'overlap',
    })
    assert.equal(overlapped.body.length, 3)
    await req(`/lessons/${overlapped.body[0].id}`, 'teacher', 'DELETE', {
      scope: 'all',
    })
    const single = {
      studentId: 'second',
      date: addDays(monday, 15),
      start: '10:30',
      end: '11:00',
    }
    assert.equal((await req('/lessons', 'teacher', 'POST', single)).status, 409)
    assert.equal(
      (
        await req('/lessons', 'teacher', 'POST', {
          ...single,
          conflicts: 'overlap',
        })
      ).status,
      201,
    )

    // All lessons: new days and times, lesson ids are kept.
    const before = (await lessonsOf(seriesId)).map((l) => l.id)
    const all = await req(`/lesson-series/${seriesId}`, 'teacher', 'PUT', {
      scope: 'all',
      title: 'Свободная тема',
      note: 'Новая заметка',
      recurrence: {
        everyWeeks: 1,
        days: [{ weekday: 3, start: '12:00', end: '12:50' }],
        endType: 'count',
        count: 5,
        plan: ['A', 'B', 'C', 'D', 'E', 'F'],
      },
    })
    assert.equal(all.status, 200)
    rows = await lessonsOf(seriesId)
    assert.deepEqual(new Set(rows.map((l) => l.id)), new Set(before))
    const moving = rows.filter((l) => l.status === 'scheduled')
    assert.ok(moving.every((l) => weekday(l.date) === 3 && l.start === '12:00'))
    assert.ok(moving.every((l) => l.note === 'Новая заметка'))
    // The no-show stays where it was and counts towards the 5.
    assert.deepEqual(
      rows.map((l) => [l.status, l.title]),
      [
        ['scheduled', 'A'],
        ['noshow', 'Present Simple'],
        ['scheduled', 'B'],
        ['scheduled', 'C'],
        ['scheduled', 'D'],
      ],
    )

    // This and following: a new series continues numbering and the package.
    const scheduled = rows.filter((l) => l.status === 'scheduled')
    const from = scheduled[2]
    const split = await req(`/lesson-series/${seriesId}`, 'teacher', 'PUT', {
      scope: 'following',
      fromLessonId: from.id,
      startDate: from.date,
      title: 'Свободная тема',
      recurrence: {
        everyWeeks: 1,
        days: [{ weekday: 5, start: '09:00', end: '09:50' }],
        endType: 'count',
        count: 5,
        plan: ['A', 'B', 'C', 'D', 'E', 'F'],
      },
    })
    assert.equal(split.status, 200)
    const tail = await lessonsOf(split.body.id)
    assert.deepEqual(
      tail.map((l) => [weekday(l.date), l.seq, l.title]),
      [
        [5, 3, 'C'],
        [5, 4, 'D'],
      ],
    )
    assert.deepEqual(
      new Set(tail.map((l) => l.id)),
      new Set([from.id, scheduled[3].id]),
    )
    assert.equal((await lessonsOf(seriesId)).length, 3)
    const series = (await req('/lesson-series', 'student')).body
    assert.equal(series.length, 2)
    assert.equal((await req('/lesson-series', 'other')).body.length, 0)
    assert.equal(
      (await req(`/lesson-series/${seriesId}`, 'other', 'PUT', {})).status,
      403,
    )

    // This and following deletion ends the series before the lesson.
    const head = await lessonsOf(seriesId)
    await req(`/lessons/${head[1].id}`, 'teacher', 'DELETE', {
      scope: 'following',
    })
    assert.equal((await lessonsOf(seriesId)).length, 1)
    await req(`/lessons/${tail[0].id}`, 'teacher', 'DELETE', { scope: 'all' })
    assert.equal((await lessonsOf(split.body.id)).length, 0)
    assert.equal(
      app.db
        .prepare('SELECT count(*) AS n FROM lesson_series WHERE id=?')
        .get(split.body.id).n,
      0,
    )

    // Past lessons are history: editing the whole series leaves them alone.
    const pastStart = addDays(today, -10)
    const past = await req('/lessons', 'teacher', 'POST', {
      studentId: 'student',
      date: pastStart,
      recurrence: {
        everyWeeks: 1,
        days: [{ weekday: weekday(pastStart), start: '06:00', end: '06:30' }],
        endType: 'count',
        count: 4,
      },
    })
    assert.equal(past.status, 201)
    await req(`/lesson-series/${past.body[0].seriesId}`, 'teacher', 'PUT', {
      scope: 'all',
      recurrence: {
        everyWeeks: 1,
        days: [{ weekday: weekday(pastStart), start: '07:00', end: '07:30' }],
        endType: 'count',
        count: 4,
      },
    })
    rows = await lessonsOf(past.body[0].seriesId)
    assert.equal(rows.length, 4)
    assert.deepEqual(
      rows.slice(0, 2).map((l) => [l.date, l.start]),
      [
        [pastStart, '06:00'],
        [addDays(pastStart, 7), '06:00'],
      ],
    )
    assert.ok(rows.slice(2).every((l) => l.start === '07:00'))
    await req(`/lessons/${rows[0].id}`, 'teacher', 'DELETE', { scope: 'all' })

    // Open-ended series are generated ahead and extended on read.
    const open = await req('/lessons', 'teacher', 'POST', {
      studentId: 'second',
      date: addDays(monday, 35),
      recurrence: {
        everyWeeks: 1,
        days: [{ weekday: 2, start: '08:00', end: '08:50' }],
        endType: 'never',
      },
    })
    assert.equal(open.status, 201)
    const last = open.body.at(-1).date
    assert.ok(last <= addDays(today, 112) && last > addDays(today, 104))
    app.db
      .prepare(`UPDATE lesson_series SET generatedUntil='' WHERE id=?`)
      .run(open.body[0].seriesId)
    app.db.prepare('DELETE FROM lessons WHERE id=?').run(open.body.at(-1).id)
    assert.equal(
      (await lessonsOf(open.body[0].seriesId)).length,
      open.body.length,
    )
  } finally {
    await new Promise((resolve) => app.server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})
