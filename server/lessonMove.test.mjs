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

test('a single lesson becomes a series; a series lesson moves with the following ones', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-lesson-move-'))
  const app = createApp({ dbPath: join(dir, 'test.sqlite') })
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${app.server.address().port}/api`
  const password = randomBytes(20).toString('hex'),
    hash = await hashPassword(password)
  for (const [id, roles, teacher] of [
    ['teacher', ['teacher'], null],
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
  // A Monday three weeks ahead: every lesson here is in the future.
  const monday = addDays(today, 22 - weekday(today))
  const studentLessons = async (studentId) =>
    (await req('/lessons', 'teacher')).body.filter(
      (l) => l.studentId === studentId,
    )
  const slots = (rows) => rows.map((l) => [l.date, l.start, l.end])
  const clear = (studentId) => {
    app.db.prepare('DELETE FROM lessons WHERE studentId=?').run(studentId)
    app.db.prepare('DELETE FROM lesson_series WHERE studentId=?').run(studentId)
  }
  const single = async (date, start, end, studentId = 'student') =>
    (
      await req('/lessons', 'teacher', 'POST', {
        studentId,
        date,
        start,
        end,
        title: 'Пробный урок',
      })
    ).body[0]
  try {
    for (const id of ['teacher', 'student', 'second']) {
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

    // A Wednesday trial lesson, moved to 11:00, starts a Thursday series.
    const trial = await single(addDays(monday, 2), '10:00', '11:00')
    const toSeries = (data, who = 'teacher') =>
      req(`/lessons/${trial.id}/series`, who, 'POST', {
        date: addDays(monday, 2),
        start: '11:00',
        end: '12:00',
        title: 'Английский',
        note: 'Повторить слова',
        recurrence: {
          everyWeeks: 1,
          days: [{ weekday: 4, start: '15:00', end: '16:00' }],
          endType: 'count',
          count: 4,
          plan: ['Знакомство', 'Present Simple'],
        },
        ...data,
      })
    assert.equal((await toSeries({}, 'student')).status, 403)
    // The new time of the first lesson is taken by another student.
    const busy = await single(addDays(monday, 2), '11:30', '12:30', 'second')
    let r = await toSeries({})
    assert.equal(r.status, 409)
    assert.deepEqual(
      r.body.conflicts.map((c) => [c.date, c.start]),
      [[addDays(monday, 2), '11:00']],
    )
    assert.equal((await studentLessons('student')).length, 1)
    assert.equal((await toSeries({ conflicts: 'skip' })).status, 409)
    await req(`/lessons/${busy.id}`, 'teacher', 'DELETE', {})
    r = await toSeries({})
    assert.equal(r.status, 201)
    let rows = await studentLessons('student')
    assert.deepEqual(slots(rows), [
      [addDays(monday, 2), '11:00', '12:00'],
      [addDays(monday, 3), '15:00', '16:00'],
      [addDays(monday, 10), '15:00', '16:00'],
      [addDays(monday, 17), '15:00', '16:00'],
    ])
    assert.equal(rows[0].id, trial.id)
    assert.ok(rows.every((l) => l.seriesId === r.body.id))
    assert.deepEqual(
      rows.map((l) => [l.seq, l.title, l.note]),
      [
        [1, 'Знакомство', 'Повторить слова'],
        [2, 'Present Simple', 'Повторить слова'],
        [3, 'Английский', 'Повторить слова'],
        [4, 'Английский', 'Повторить слова'],
      ],
    )
    assert.equal((await toSeries({})).status, 400)

    // The first lesson can still be moved; the rule keeps the rest in place.
    r = await req(`/lessons/${trial.id}`, 'teacher', 'PATCH', {
      date: addDays(monday, 1),
      start: '09:00',
      end: '09:30',
      title: rows[0].title,
      note: '',
    })
    assert.equal(r.status, 200)
    rows = await studentLessons('student')
    assert.deepEqual(slots(rows).slice(0, 2), [
      [addDays(monday, 1), '09:00', '09:30'],
      [addDays(monday, 3), '15:00', '16:00'],
    ])
    assert.equal(rows.length, 4)
    // Editing the whole series does not touch the first lesson.
    r = await req(`/lesson-series/${rows[0].seriesId}`, 'teacher', 'PUT', {
      scope: 'all',
      title: 'Английский',
      recurrence: {
        everyWeeks: 1,
        days: [{ weekday: 5, start: '15:00', end: '16:00' }],
        endType: 'count',
        count: 4,
      },
    })
    assert.equal(r.status, 200)
    assert.deepEqual(slots(await studentLessons('student')), [
      [addDays(monday, 1), '09:00', '09:30'],
      [addDays(monday, 4), '15:00', '16:00'],
      [addDays(monday, 11), '15:00', '16:00'],
      [addDays(monday, 18), '15:00', '16:00'],
    ])
    clear('student')

    // The rule on the lesson's own weekday and time: no duplicate that day.
    const same = await single(monday, '10:00', '11:00')
    r = await req(`/lessons/${same.id}/series`, 'teacher', 'POST', {
      date: monday,
      start: '10:00',
      end: '11:00',
      recurrence: {
        everyWeeks: 1,
        days: [{ weekday: 1, start: '10:00', end: '11:00' }],
        endType: 'count',
        count: 3,
      },
    })
    assert.equal(r.status, 201)
    assert.deepEqual(slots(await studentLessons('student')), [
      [monday, '10:00', '11:00'],
      [addDays(monday, 7), '10:00', '11:00'],
      [addDays(monday, 14), '10:00', '11:00'],
    ])
    clear('student')

    // Mon 10:00 and Thu 15:00: Monday lessons move to Tuesday 12:00 from the
    // second week on, Thursday lessons stay.
    const created = await req('/lessons', 'teacher', 'POST', {
      studentId: 'student',
      date: monday,
      recurrence: {
        everyWeeks: 1,
        days: [
          { weekday: 1, start: '10:00', end: '11:00' },
          { weekday: 4, start: '15:00', end: '16:00' },
        ],
        endType: 'count',
        count: 6,
        plan: ['1', '2', '3', '4', '5', '6'],
      },
    })
    assert.equal(created.status, 201)
    const moved = created.body[2]
    assert.equal(moved.date, addDays(monday, 7))
    const move = (lesson, date, start, end, scope = 'following') =>
      req(`/lessons/${lesson.id}`, 'teacher', 'PATCH', {
        date,
        start,
        end,
        title: lesson.title,
        note: lesson.note,
        scope,
      })
    assert.equal(
      (await move(moved, addDays(monday, 8), '12:00', '13:00', 'some')).status,
      400,
    )
    r = await move(moved, addDays(monday, 8), '12:00', '13:00')
    assert.equal(r.status, 200)
    rows = await studentLessons('student')
    assert.deepEqual(slots(rows), [
      [monday, '10:00', '11:00'],
      [addDays(monday, 3), '15:00', '16:00'],
      [addDays(monday, 8), '12:00', '13:00'],
      [addDays(monday, 10), '15:00', '16:00'],
      [addDays(monday, 15), '12:00', '13:00'],
      [addDays(monday, 17), '15:00', '16:00'],
    ])
    assert.equal(rows[2].id, moved.id)
    assert.deepEqual(
      rows.map((l) => [l.seq, l.title]),
      [1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]),
    )
    const [oldSeries, newSeries] = [rows[0].seriesId, rows[2].seriesId]
    assert.notEqual(oldSeries, newSeries)
    assert.ok(rows.slice(2).every((l) => l.seriesId === newSeries))
    const series = (await req('/lesson-series', 'teacher')).body
    assert.deepEqual(series.find((s) => s.id === newSeries).days, [
      { weekday: 2, start: '12:00', end: '13:00' },
      { weekday: 4, start: '15:00', end: '16:00' },
    ])
    assert.equal(
      series.find((s) => s.id === oldSeries).until,
      addDays(monday, 6),
    )
    // Thursday onto Tuesday: that weekday already has a lesson.
    r = await move(rows[3], addDays(monday, 15), '16:00', '17:00')
    assert.equal(r.status, 400)
    // A cancelled lesson moves only by itself.
    await req(`/lessons/${rows[5].id}/status`, 'teacher', 'POST', {
      status: 'cancelled',
    })
    const cancelled = (await studentLessons('student')).find(
      (l) => l.id === rows[5].id,
    )
    r = await move(cancelled, addDays(monday, 18), '15:00', '16:00')
    assert.equal(r.status, 400)
    clear('student')

    // The same weekday a week later: lessons of that week are dropped and
    // the package continues after the moved lesson.
    const weekly = await req('/lessons', 'teacher', 'POST', {
      studentId: 'student',
      date: monday,
      recurrence: {
        everyWeeks: 1,
        days: [{ weekday: 1, start: '10:00', end: '11:00' }],
        endType: 'count',
        count: 4,
      },
    })
    r = await move(weekly.body[1], addDays(monday, 14), '10:00', '11:00')
    assert.equal(r.status, 200)
    rows = await studentLessons('student')
    assert.deepEqual(
      rows.map((l) => l.date),
      [0, 14, 21, 28].map((n) => addDays(monday, n)),
    )
    assert.equal(rows[1].id, weekly.body[1].id)
    clear('student')

    // Every two weeks: the new date sets the rhythm.
    const fortnight = await req('/lessons', 'teacher', 'POST', {
      studentId: 'student',
      date: monday,
      recurrence: {
        everyWeeks: 2,
        days: [{ weekday: 1, start: '10:00', end: '11:00' }],
        endType: 'count',
        count: 3,
      },
    })
    assert.deepEqual(
      fortnight.body.map((l) => l.date),
      [0, 14, 28].map((n) => addDays(monday, n)),
    )
    r = await move(fortnight.body[1], addDays(monday, 21), '10:00', '11:00')
    assert.equal(r.status, 200)
    assert.deepEqual(
      (await studentLessons('student')).map((l) => l.date),
      [0, 21, 35].map((n) => addDays(monday, n)),
    )

    // A conflict of the following lessons can be skipped.
    const other = await single(addDays(monday, 35), '12:00', '13:00', 'second')
    rows = await studentLessons('student')
    r = await move(rows[1], addDays(monday, 21), '12:00', '13:00')
    assert.equal(r.status, 409)
    assert.deepEqual(
      r.body.conflicts.map((c) => c.date),
      [addDays(monday, 35)],
    )
    r = await req(`/lessons/${rows[1].id}`, 'teacher', 'PATCH', {
      date: addDays(monday, 21),
      start: '12:00',
      end: '13:00',
      title: rows[1].title,
      note: '',
      scope: 'following',
      conflicts: 'skip',
    })
    assert.equal(r.status, 200)
    assert.deepEqual(slots(await studentLessons('student')), [
      [monday, '10:00', '11:00'],
      [addDays(monday, 21), '12:00', '13:00'],
      [addDays(monday, 49), '12:00', '13:00'],
    ])
    assert.ok(other)
  } finally {
    await new Promise((resolve) => app.server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})
