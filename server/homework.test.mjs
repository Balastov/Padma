import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword } from './store.mjs'

test('homework lifecycle, private attachments, reassignment and persistence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-homework-'))
  const dbPath = join(dir, 'test.sqlite')
  const app = createApp({ dbPath })
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${app.server.address().port}/api`
  const password = randomBytes(20).toString('hex'),
    hash = await hashPassword(password)
  for (const [id, roles, teacher] of [
    ['owner', ['owner'], null],
    ['teacher', ['teacher'], null],
    ['other', ['teacher'], null],
    ['student', ['student'], 'teacher'],
    ['outsider', ['student'], 'other'],
    ['guest', ['guest'], null],
  ])
    app.db
      .prepare(
        'INSERT INTO users (id,name,email,password,roles,teacherId) VALUES (?,?,?,?,?,?)',
      )
      .run(id, id, id + '@example.test', hash, JSON.stringify(roles), teacher)
  const cookies = {}
  async function req(path, who, method = 'GET', data) {
    return fetch(base + path, {
      method,
      headers: {
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        Cookie: cookies[who] || '',
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
  }
  try {
    for (const id of [
      'owner',
      'teacher',
      'other',
      'student',
      'outsider',
      'guest',
    ]) {
      const r = await req('/login', id, 'POST', {
        email: id + '@example.test',
        password,
      })
      assert.equal(r.status, 200)
      cookies[id] = r.headers.get('set-cookie').split(';')[0]
    }
    assert.equal((await req('/homework', '')).status, 401)
    const task = {
      studentId: 'student',
      title: 'Past Simple',
      description: 'Напишите пять предложений',
      due: '2026-09-25',
    }
    assert.equal((await req('/homework', 'other', 'POST', task)).status, 403)
    assert.equal((await req('/homework', 'student', 'POST', task)).status, 403)
    assert.equal(
      (
        await req('/homework', 'teacher', 'POST', {
          ...task,
          due: '2026-02-30',
        })
      ).status,
      400,
    )
    const result = await req('/homework', 'teacher', 'POST', task)
    assert.equal(result.status, 201)
    const item = await result.json(),
      path = '/homework/' + item.id
    for (const role of ['other', 'outsider', 'guest'])
      assert.deepEqual(await (await req('/homework', role)).json(), [])
    assert.equal((await (await req('/homework', 'owner')).json()).length, 1)
    assert.equal(
      (
        await req(path + '/submit', 'teacher', 'POST', {
          text: 'answer',
          files: [],
        })
      ).status,
      403,
    )
    assert.equal(
      (
        await req(path + '/submit', 'outsider', 'POST', {
          text: 'answer',
          files: [],
        })
      ).status,
      404,
    )
    assert.equal(
      (await req(path + '/submit', 'student', 'POST', { text: '', files: [] }))
        .status,
      400,
    )
    for (const file of [
      { name: 'bad.html', data: 'YWJj' },
      { name: '../secret.pdf', data: 'YWJj' },
      { name: 'empty.pdf', data: '' },
      { name: 'bad.pdf', data: '!' },
      {
        name: 'large.pdf',
        data: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64'),
      },
    ])
      assert.equal(
        (
          await req(path + '/submit', 'student', 'POST', {
            text: '',
            files: [file],
          })
        ).status,
        400,
      )
    const bytes = Buffer.from('%PDF-1.4\nTest student answer'),
      file = { name: 'Ответ.pdf', data: bytes.toString('base64') }
    const sent = await req(path + '/submit', 'student', 'POST', {
      text: 'I studied English.',
      files: [file],
    })
    assert.equal(sent.status, 201)
    const submitted = await sent.json(),
      version = submitted.submissions[0],
      filePath = '/homework/files/' + version.files[0].id
    assert(!('data' in version.files[0]))
    for (const who of ['student', 'teacher', 'owner']) {
      const r = await req(filePath, who)
      assert.equal(r.status, 200)
      assert.match(r.headers.get('content-disposition'), /^attachment/)
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
      assert.deepEqual(Buffer.from(await r.arrayBuffer()), bytes)
    }
    for (const who of ['other', 'outsider', 'guest'])
      assert.equal((await req(filePath, who)).status, 404)
    assert.equal((await req(filePath, '')).status, 401)
    assert.equal(
      (
        await req(path + '/submit', 'student', 'POST', {
          text: 'duplicate',
          files: [],
        })
      ).status,
      409,
    )
    const review = {
      status: 'returned',
      comment: 'Добавьте ещё четыре предложения',
      submissionId: version.id,
    }
    assert.equal(
      (await req(path + '/review', 'student', 'POST', review)).status,
      403,
    )
    assert.equal(
      (
        await req(path + '/review', 'teacher', 'POST', {
          ...review,
          comment: '',
        })
      ).status,
      400,
    )
    assert.equal(
      (await req(path + '/review', 'teacher', 'POST', review)).status,
      200,
    )
    assert.equal(
      (await req(path + '/review', 'teacher', 'POST', review)).status,
      409,
    )
    const second = await req(path + '/submit', 'student', 'POST', {
      text: 'Исправленный ответ',
      files: [],
    })
    assert.equal(second.status, 201)
    const updated = await second.json()
    assert.equal(updated.submissions.length, 2)
    assert.equal(updated.submissions[0].comment, review.comment)
    assert.equal(
      (
        await req(path + '/review', 'teacher', 'POST', {
          ...review,
          status: 'accepted',
        })
      ).status,
      409,
    )
    assert.equal(
      (
        await req(path + '/review', 'teacher', 'POST', {
          status: 'accepted',
          comment: 'Отлично',
          submissionId: updated.submissions[1].id,
        })
      ).status,
      200,
    )
    assert.equal(
      (
        await req(path + '/submit', 'student', 'POST', {
          text: 'third',
          files: [],
        })
      ).status,
      409,
    )
    app.db
      .prepare('UPDATE users SET teacherId=? WHERE id=?')
      .run('other', 'student')
    assert.equal((await req(filePath, 'teacher')).status, 404)
    assert.equal((await req(filePath, 'other')).status, 200)
    assert.deepEqual(await (await req('/homework', 'teacher')).json(), [])
    app.db.prepare('UPDATE users SET archived=1 WHERE id=?').run('student')
    assert.equal((await req(filePath, 'other')).status, 404)
    assert.equal((await req(filePath, 'student')).status, 401)
    await new Promise((r) => app.server.close(r))
    const reopened = createApp({ dbPath })
    assert.equal(
      reopened.db.prepare('SELECT count(*) AS n FROM submissions').get().n,
      2,
    )
    assert.equal(
      reopened.db
        .prepare(
          'SELECT status FROM submissions ORDER BY created DESC,id DESC LIMIT 1',
        )
        .get().status,
      'accepted',
    )
    assert.deepEqual(
      Buffer.from(
        reopened.db.prepare('SELECT data FROM homework_files').get().data,
      ),
      bytes,
    )
    reopened.db.close()
  } finally {
    if (app.server.listening) await new Promise((r) => app.server.close(r))
    rmSync(dir, { recursive: true, force: true })
  }
})
