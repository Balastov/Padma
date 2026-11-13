import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword } from './store.mjs'
import { purgeDoneHomework, homeworkStatus } from './homework.mjs'

test('homework statuses', () => {
  const today = '2026-11-13'
  assert.equal(homeworkStatus({ due: '' }, undefined, today), 'assigned')
  assert.equal(homeworkStatus({ due: today }, undefined, today), 'assigned')
  assert.equal(
    homeworkStatus({ due: '2026-11-12' }, undefined, today),
    'overdue',
  )
  const late = { due: '2026-11-12' }
  assert.equal(homeworkStatus(late, { status: 'submitted' }, today), 'review')
  assert.equal(homeworkStatus(late, { status: 'returned' }, today), 'overdue')
  assert.equal(
    homeworkStatus({ due: '' }, { status: 'returned' }, today),
    'assigned',
  )
  // Returned for revision before the due date passes: still assigned.
  for (const due of [today, '2026-11-20'])
    assert.equal(
      homeworkStatus({ due }, { status: 'returned' }, today),
      'assigned',
    )
  assert.equal(homeworkStatus(late, { status: 'accepted' }, today), 'done')
})

test('homework edit, archive, delete, rights and purge of completed work', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-hw-manage-'))
  const dbPath = join(dir, 'test.sqlite')
  const app = createApp({ dbPath })
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${app.server.address().port}/api`
  const password = randomBytes(20).toString('hex'),
    hash = await hashPassword(password)
  const people = [
    ['owner', ['owner'], null],
    ['admin', ['admin'], null],
    ['teacher', ['teacher'], null],
    ['other', ['teacher'], null],
    ['student', ['student'], 'teacher'],
    ['guest', ['guest'], null],
  ]
  for (const [id, roles, teacher] of people)
    app.db
      .prepare(
        'INSERT INTO users (id,name,email,password,roles,teacherId) VALUES (?,?,?,?,?,?)',
      )
      .run(id, id, id + '@example.test', hash, JSON.stringify(roles), teacher)
  const cookies = {}
  const headers = (who, type = 'application/json') => ({
    Origin: 'http://localhost:5173',
    'Content-Type': type,
    Cookie: cookies[who] || '',
  })
  const req = (path, who, method = 'GET', data) =>
    fetch(base + path, {
      method,
      headers: headers(who),
      body: data === undefined ? undefined : JSON.stringify(data),
    })
  const json = async (path, who, method, data) => {
    const r = await req(path, who, method, data)
    return { status: r.status, body: await r.json() }
  }
  const upload = async (who, name) =>
    (
      await (
        await fetch(base + '/files?name=' + encodeURIComponent(name), {
          method: 'POST',
          headers: headers(who, 'application/octet-stream'),
          body: Buffer.from('file ' + name),
        })
      ).json()
    ).id
  const create = async (who, extra = {}) =>
    (
      await json('/homework', who, 'POST', {
        studentId: 'student',
        title: 'Задание',
        description: 'Описание',
        due: '',
        ...extra,
      })
    ).body
  const list = async (who) => (await json('/homework', who)).body
  try {
    for (const [id] of people) {
      const r = await req('/login', id, 'POST', {
        email: id + '@example.test',
        password,
      })
      assert.equal(r.status, 200)
      cookies[id] = r.headers.get('set-cookie').split(';')[0]
    }

    // Statuses: assigned → review → assigned after return → done; overdue.
    const first = await create('teacher')
    const path = '/homework/' + first.id
    assert.equal(first.status, 'assigned')
    assert.equal(first.archived, false)
    assert.equal(first.canManage, true)
    assert.equal((await list('student'))[0].canManage, false)
    for (const who of ['owner', 'admin'])
      assert.equal((await list(who))[0].canManage, true)
    const overdue = await create('teacher', { due: '2020-01-01' })
    assert.equal(overdue.status, 'overdue')
    let r = await json(path + '/submit', 'student', 'POST', { text: 'ответ' })
    assert.equal(r.body.status, 'review')
    r = await json(path + '/review', 'teacher', 'POST', {
      status: 'returned',
      comment: 'Доработайте',
      submissionId: r.body.submissions[0].id,
    })
    assert.equal(r.body.status, 'assigned')
    r = await json(path + '/submit', 'student', 'POST', { text: 'исправил' })
    r = await json(path + '/review', 'teacher', 'POST', {
      status: 'accepted',
      comment: '',
      submissionId: r.body.submissions[1].id,
    })
    assert.equal(r.status, 200)
    assert.equal(r.body.status, 'done')

    // Edit: only owner, admin and the student's teacher.
    const keep = await upload('teacher', 'keep.pdf'),
      drop = await upload('teacher', 'drop.pdf')
    const task = await create('teacher', { fileIds: [keep, drop] })
    const taskPath = '/homework/' + task.id
    const edit = {
      title: 'Новое название',
      description: 'Новое описание',
      due: '2030-01-10',
    }
    for (const [who, status] of [
      ['student', 403],
      ['other', 404],
      ['guest', 404],
    ]) {
      assert.equal((await req(taskPath, who, 'PATCH', edit)).status, status)
      assert.equal(
        (await req(taskPath + '/archive', who, 'POST', { archived: true }))
          .status,
        status,
      )
      assert.equal((await req(taskPath, who, 'DELETE')).status, status)
    }
    assert.equal(
      (await req(taskPath, 'teacher', 'PATCH', { ...edit, title: '' })).status,
      400,
    )
    assert.equal(
      (await req(taskPath, 'teacher', 'PATCH', { ...edit, due: '2030-02-31' }))
        .status,
      400,
    )
    // Too many files: nothing changes, the removed file stays.
    const extra = []
    for (let i = 0; i < 5; i++) extra.push(await upload('teacher', `x${i}.pdf`))
    assert.equal(
      (
        await req(taskPath, 'teacher', 'PATCH', {
          ...edit,
          removeFileIds: [drop],
          fileIds: extra,
        })
      ).status,
      400,
    )
    assert(existsSync(app.store.path(drop)))
    assert.equal(
      (await list('student')).find((h) => h.id === task.id).title,
      'Задание',
    )
    const added = await upload('teacher', 'added.pdf')
    r = await json(taskPath, 'teacher', 'PATCH', {
      ...edit,
      removeFileIds: [drop],
      fileIds: [added],
    })
    assert.equal(r.status, 200)
    assert.equal(r.body.title, 'Новое название')
    assert.equal(r.body.due, '2030-01-10')
    assert.deepEqual(
      r.body.files.map((f) => f.name),
      ['keep.pdf', 'added.pdf'],
    )
    assert.equal(existsSync(app.store.path(drop)), false)
    assert.equal((await req('/files/' + drop, 'teacher')).status, 404)
    for (const who of ['owner', 'admin'])
      assert.equal(
        (await req(taskPath, who, 'PATCH', { ...edit, title: who })).status,
        200,
      )

    // Archive hides the homework, its files and trainer set from the student.
    assert.equal(
      (await req(taskPath + '/archive', 'teacher', 'POST', {})).status,
      400,
    )
    r = await json(taskPath + '/archive', 'teacher', 'POST', { archived: true })
    assert.equal(r.body.archived, true)
    assert(!(await list('student')).some((h) => h.id === task.id))
    assert((await list('teacher')).find((h) => h.id === task.id).archived)
    assert.equal((await req('/files/' + keep, 'student')).status, 404)
    assert.equal((await req('/files/' + keep, 'teacher')).status, 200)
    assert.equal(
      (await req(taskPath + '/submit', 'student', 'POST', { text: 'x' }))
        .status,
      404,
    )
    assert(
      !(await json('/lexicon/me/homework', 'student')).body.some(
        (h) => h.id === task.id,
      ),
    )
    r = await json(taskPath + '/archive', 'owner', 'POST', { archived: false })
    assert.equal(r.body.archived, false)
    assert((await list('student')).some((h) => h.id === task.id))
    assert.equal((await req('/files/' + keep, 'student')).status, 200)
    // An archived submission cannot be reviewed.
    r = await json(taskPath + '/submit', 'student', 'POST', { text: 'готово' })
    await req(taskPath + '/archive', 'teacher', 'POST', { archived: true })
    assert.equal(
      (
        await req(taskPath + '/review', 'teacher', 'POST', {
          status: 'accepted',
          submissionId: r.body.submissions[0].id,
        })
      ).status,
      409,
    )

    // Delete removes homework, answers and files for good.
    const answerFile = await upload('student', 'answer.pdf')
    const doomed = await create('teacher', {
      fileIds: [await upload('teacher', 'task.pdf')],
    })
    r = await json('/homework/' + doomed.id + '/submit', 'student', 'POST', {
      text: '',
      fileIds: [answerFile],
    })
    const doomedFiles = [doomed.files[0].id, r.body.submissions[0].files[0].id]
    assert.equal(
      (await req('/homework/' + doomed.id, 'admin', 'DELETE')).status,
      200,
    )
    assert.equal(
      (await req('/homework/' + doomed.id, 'admin', 'DELETE')).status,
      404,
    )
    assert(!(await list('teacher')).some((h) => h.id === doomed.id))
    for (const id of doomedFiles) {
      assert.equal(existsSync(app.store.path(id)), false)
      assert.equal((await req('/files/' + id, 'teacher')).status, 404)
    }
    for (const table of ['homework', 'submissions'])
      assert.equal(
        app.db
          .prepare(
            `SELECT count(*) AS n FROM ${table} WHERE ${table === 'homework' ? 'id' : 'homeworkId'}=?`,
          )
          .get(doomed.id).n,
        0,
      )

    // Completed homework disappears 30 days after it was marked done.
    const before = (await list('owner')).length
    assert.equal(await purgeDoneHomework(app.db, app.store), 0)
    assert.equal(
      await purgeDoneHomework(
        app.db,
        app.store,
        new Date(Date.now() + 29 * 864e5),
      ),
      0,
    )
    assert.equal(
      await purgeDoneHomework(
        app.db,
        app.store,
        new Date(Date.now() + 31 * 864e5),
      ),
      1,
    )
    const after = await list('owner')
    assert.equal(after.length, before - 1)
    assert(!after.some((h) => h.id === first.id))
    assert(after.some((h) => h.id === overdue.id))
  } finally {
    if (app.server.listening) await new Promise((r) => app.server.close(r))
    rmSync(dir, { recursive: true, force: true })
  }
})
