import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword } from './store.mjs'
import { importLexicon } from './lexicon.mjs'
import { readXlsx } from './xlsx.mjs'
import { buildXlsx } from './testXlsx.mjs'

const WORDS = [
  ['Термин', 'Перевод', 'Контекстное предложение', 'Учебник', 'Уровень книги', 'Юнит', 'Тема', 'Транскрипция из индекса'],
  ['basket', 'корзина', '', 'Elementary', 'A1-A2', 1, 'Дом', ''],
  ['arrive', 'приезжать', '', 'Elementary', 'A1-A2', 1, 'Дом', ''],
]

test('study plans: template, student copy, homework after lessons, off-plan lessons', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-plans-'))
  const app = createApp({ dbPath: join(dir, 'test.sqlite') })
  const { db, issuePlans } = app
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${app.server.address().port}/api`
  const password = randomBytes(18).toString('hex'),
    hash = await hashPassword(password)
  for (const [id, roles, teacher] of [
    ['teacher', ['teacher'], null],
    ['other', ['teacher'], null],
    ['student', ['student'], 'teacher'],
    ['second', ['student'], 'teacher'],
  ])
    db.prepare(
      'INSERT INTO users (id,name,email,password,roles,teacherId) VALUES (?,?,?,?,?,?)',
    ).run(id, id, `${id}@example.test`, hash, JSON.stringify(roles), teacher)
  importLexicon(db, readXlsx(buildXlsx(WORDS)))
  const cookies = {}
  const request = async (path, who, method = 'GET', data) => {
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
  const upload = async (who, name) =>
    (
      await fetch(base + '/files?name=' + encodeURIComponent(name), {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:5173',
          'Content-Type': 'application/octet-stream',
          Cookie: cookies[who],
        },
        body: Buffer.from('content of ' + name),
      })
    ).json()
  const lesson = (id, date, status = 'scheduled') =>
    db
      .prepare(
        `INSERT INTO lessons (id,studentId,teacherId,date,start,end,title,status)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(id, 'student', 'teacher', date, '10:00', '11:00', 'Урок', status)
  const homeworkOf = (who) => request('/homework', who)
  try {
    for (const id of ['teacher', 'other', 'student', 'second']) {
      const res = await fetch(base + '/login', {
        method: 'POST',
        headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `${id}@example.test`, password }),
      })
      cookies[id] = res.headers.get('set-cookie').split(';')[0]
    }
    assert.equal((await request('/plans', 'student')).status, 403)

    // Grammar lives in the library section; only «second» may see it.
    const grammarFile = await upload('teacher', 'Present Simple.pdf')
    const grammar = await request('/library', 'teacher', 'POST', {
      title: 'Present Simple',
      fileId: grammarFile.id,
      audience: 'selected',
      studentIds: ['second'],
      category: 'grammar',
    })
    assert.equal(grammar.status, 201)
    assert.equal(grammar.body.category, 'grammar')
    assert.equal(
      (await request('/library', 'teacher', 'POST', {
        title: 'X', fileId: 'x', audience: 'all', category: 'secret',
      })).status,
      400,
    )
    assert.deepEqual(
      (await request('/plans/grammar', 'other')).body.map((g) => g.title),
      ['Present Simple'],
    )

    // Program: one block, three lessons.
    const program = await request('/plans', 'teacher', 'POST', { title: 'A1 за 3 урока' })
    assert.equal(program.status, 201)
    const block = await request(`/plans/${program.body.id}/blocks`, 'teacher', 'POST', {})
    assert.equal(block.body.blocks[0].title, 'Блок 1')
    const blockId = block.body.createdId
    const steps = []
    assert.equal(
      (await request(`/plan-blocks/${blockId}/lessons`, 'teacher', 'POST', { title: ' ' })).status,
      400,
    )
    for (const title of ['Знакомство', 'Повторение', 'Покупки'])
      steps.push(
        (await request(`/plan-blocks/${blockId}/lessons`, 'teacher', 'POST', { title }))
          .body.createdId,
      )
    const ids = Object.fromEntries(
      (await request('/lexicon/search?limit=10', 'teacher')).body.items.map((t) => [t.term, t.id]),
    )
    const taskFile = await upload('teacher', 'task.txt')
    const saved = await request(`/plan-lessons/${steps[0]}`, 'teacher', 'PUT', {
      title: 'Знакомство',
      homework: 'Прочитайте [правило](https://example.com/rule) и выучите слова.',
      lexicon: [{ kind: 'search', termIds: [ids.basket, ids.arrive] }],
      grammarIds: [grammar.body.id],
      fileIds: [taskFile.id],
    })
    assert.equal(saved.status, 200)
    const first = saved.body.blocks[0].lessons[0]
    assert.deepEqual(first.lexicon[0].words.map((w) => w.term), ['basket', 'arrive'])
    assert.deepEqual(first.grammar.map((g) => g.title), ['Present Simple'])
    assert.equal(first.files.length, 1)
    await request(`/plan-lessons/${steps[2]}`, 'teacher', 'PUT', {
      title: 'Покупки',
      homework: 'Составьте список покупок.',
    })
    assert.equal(
      (await request(`/plan-lessons/${steps[0]}`, 'teacher', 'PUT', {
        title: 'Знакомство',
        grammarIds: ['nope'],
      })).status,
      400,
    )
    // Another teacher sees the program but cannot change it.
    assert.equal((await request(`/plans/${program.body.id}`, 'other')).status, 200)
    assert.equal(
      (await request(`/plan-lessons/${steps[0]}`, 'other', 'PUT', { title: 'x' })).status,
      403,
    )
    assert.equal(
      (await request(`/plans/${program.body.id}/assign`, 'other', 'POST', {
        studentId: 'student', startDate: '2030-01-01',
      })).status,
      403,
    )

    // Lessons: the second one is cancelled and does not count.
    lesson('l1', '2030-01-10')
    lesson('l2', '2030-01-12', 'cancelled')
    lesson('l3', '2030-01-14')
    lesson('l4', '2030-01-16')
    lesson('l5', '2030-01-18')
    const assigned = await request(`/plans/${program.body.id}/assign`, 'teacher', 'POST', {
      studentId: 'student',
      startDate: '2030-01-01',
    })
    assert.equal(assigned.status, 201)
    const planId = assigned.body.id
    assert.equal(assigned.body.studentId, 'student')
    assert.deepEqual(
      assigned.body.blocks[0].lessons.map((l) => l.lesson?.id),
      ['l1', 'l3', 'l4'],
    )
    const copiedStep = assigned.body.blocks[0].lessons[0]
    assert.notEqual(copiedStep.id, steps[0])
    assert.notEqual(copiedStep.files[0].id, first.files[0].id)

    const numbers = async () =>
      Object.fromEntries(
        (await request('/lessons', 'teacher')).body
          .filter((l) => l.plan)
          .map((l) => [l.id, l.plan.number]),
      )
    assert.deepEqual(await numbers(), { l1: 1, l2: null, l3: 2, l4: 3, l5: null })

    // Nothing before the first lesson ends, then the first homework.
    assert.equal(await issuePlans({ key: '2030-01-10T10:59' }), 0)
    assert.equal(await issuePlans({ key: '2030-01-10T11:00' }), 1)
    let given = (await homeworkOf('student')).body
    assert.equal(given.length, 1)
    assert.equal(given[0].title, 'Урок 1 — Знакомство')
    assert.equal(given[0].due, '2030-01-14')
    assert.match(given[0].description, /\[правило\]\(https:\/\/example\.com\/rule\)/)
    assert.deepEqual(given[0].lexicon.words.map((w) => w.term), ['basket', 'arrive'])
    assert.deepEqual(given[0].materials.map((m) => m.title), ['Present Simple'])
    assert.equal(given[0].files.length, 1)
    // The grammar of the homework opens for the student.
    assert.ok(
      (await request('/library', 'student')).body.some((m) => m.id === grammar.body.id),
    )
    const material = given[0].materials[0]
    assert.equal(
      (await fetch(base + '/files/' + material.file.id, {
        headers: { Cookie: cookies.student },
      })).status,
      200,
    )
    assert.equal(
      (await fetch(base + '/files/' + given[0].files[0].id, {
        headers: { Cookie: cookies.student },
      })).status,
      200,
    )
    // Plan files are for teachers only.
    assert.equal(
      (await fetch(base + '/files/' + copiedStep.files[0].id, {
        headers: { Cookie: cookies.student },
      })).status,
      404,
    )
    assert.equal(await issuePlans({ key: '2030-01-10T12:00' }), 0)

    // «Урок вне плана»: the next lesson takes its number.
    const off = await request('/lessons/l3/plan', 'teacher', 'POST', { offPlan: true })
    assert.equal(off.status, 200)
    assert.equal(off.body.offPlan, true)
    assert.equal((await request('/lessons/l3/plan', 'student', 'POST', { offPlan: false })).status, 403)
    assert.deepEqual(await numbers(), { l1: 1, l2: null, l3: null, l4: 2, l5: 3 })
    assert.equal(await issuePlans({ key: '2030-01-14T12:00' }), 0)
    // The empty plan lesson passes without homework.
    assert.equal(await issuePlans({ key: '2030-01-16T12:00' }), 1)
    assert.equal((await homeworkOf('student')).body.length, 1)
    // Back in the plan: the lesson that has already ended gives the next task.
    await request('/lessons/l3/plan', 'teacher', 'POST', { offPlan: false })
    assert.equal(await issuePlans({ key: '2030-01-16T12:00' }), 1)
    given = (await homeworkOf('student')).body
    assert.deepEqual(given.map((h) => h.title), ['Урок 3 — Покупки', 'Урок 1 — Знакомство'])
    assert.equal(given[0].due, '2030-01-18')
    const progress = (await request(`/plans/${planId}`, 'teacher')).body
    assert.deepEqual(
      progress.blocks[0].lessons.map((l) => Boolean(l.issue)),
      [true, true, true],
    )
    assert.equal(await issuePlans({ key: '2030-01-20T12:00' }), 0)
    const list = (await request('/plans', 'teacher')).body
    assert.deepEqual(
      list.map((p) => [p.studentId, p.lessonCount, p.passed]).sort(),
      [['student', 3, 3], [null, 3, 0]].sort(),
    )

    // One plan per student: replacing needs confirmation.
    const again = await request(`/plans/${program.body.id}/assign`, 'teacher', 'POST', {
      studentId: 'student',
      startDate: '2030-02-01',
    })
    assert.equal(again.status, 409)
    assert.equal(again.body.existing.id, planId)
    const replaced = await request(`/plans/${program.body.id}/assign`, 'teacher', 'POST', {
      studentId: 'student',
      startDate: '2030-02-01',
      replace: true,
    })
    assert.equal(replaced.status, 201)
    assert.equal((await request(`/plans/${planId}`, 'teacher')).status, 404)
    // Issued homework stays with the student.
    assert.equal((await homeworkOf('student')).body.length, 2)

    // Order: a lesson moves to the next block at the block's edge.
    const second = await request(`/plans/${program.body.id}/blocks`, 'teacher', 'POST', { title: 'Путешествия' })
    await request(`/plan-lessons/${steps[2]}/move`, 'teacher', 'POST', { direction: 1 })
    const moved = (await request(`/plans/${program.body.id}`, 'teacher')).body
    assert.deepEqual(
      moved.blocks.map((b) => b.lessons.map((l) => l.title)),
      [['Знакомство', 'Повторение'], ['Покупки']],
    )
    assert.equal(moved.blocks[1].id, second.body.createdId)
    await request(`/plan-blocks/${blockId}/move`, 'teacher', 'POST', { direction: 1 })
    assert.deepEqual(
      (await request(`/plans/${program.body.id}`, 'teacher')).body.blocks.map((b) => b.title),
      ['Путешествия', 'Блок 1'],
    )
    assert.equal((await request(`/plan-lessons/${steps[1]}`, 'teacher', 'DELETE')).status, 200)
    assert.equal((await request(`/plans/${program.body.id}`, 'teacher', 'DELETE')).status, 200)
    assert.equal(db.prepare(`SELECT count(*) AS n FROM files WHERE kind='plan' AND refId=?`).get(steps[0]).n, 0)
  } finally {
    app.server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
