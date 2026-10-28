import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createApp } from './index.mjs'
import { hashPassword, openStore } from './store.mjs'
import { purgeFiles } from './files.mjs'

test('chat and library files: access, retention and moving old blobs to disk', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'padma-files-'))
  const dbPath = join(dir, 'test.sqlite')
  const password = randomBytes(20).toString('hex'),
    hash = await hashPassword(password)
  // A database from the previous version: a submission file as a BLOB.
  const old = openStore(dbPath)
  for (const [id, roles, teacher] of [
    ['owner', ['owner'], null],
    ['teacher', ['teacher'], null],
    ['other', ['teacher'], null],
    ['student', ['student'], 'teacher'],
    ['second', ['student'], 'teacher'],
    ['outsider', ['student'], 'other'],
  ])
    old
      .prepare(
        'INSERT INTO users (id,name,email,password,roles,teacherId) VALUES (?,?,?,?,?,?)',
      )
      .run(id, id, id + '@example.test', hash, JSON.stringify(roles), teacher)
  old.exec(`CREATE TABLE homework (id TEXT PRIMARY KEY, studentId TEXT, authorId TEXT, title TEXT, description TEXT, due TEXT, created TEXT);
    CREATE TABLE submissions (id TEXT PRIMARY KEY, homeworkId TEXT, text TEXT, created TEXT, status TEXT NOT NULL DEFAULT 'submitted', comment TEXT NOT NULL DEFAULT '', reviewerId TEXT, reviewed TEXT);
    CREATE TABLE homework_files (id TEXT PRIMARY KEY, submissionId TEXT NOT NULL REFERENCES submissions(id), name TEXT NOT NULL, data BLOB NOT NULL);
    INSERT INTO homework VALUES ('hw','student','teacher','T','D','','2026-01-01T00:00:00Z');
    INSERT INTO submissions (id,homeworkId,text,created) VALUES ('sub','hw','','2026-01-02T00:00:00Z');`)
  old
    .prepare('INSERT INTO homework_files VALUES (?,?,?,?)')
    .run('legacy-file', 'sub', 'old.pdf', Buffer.from('legacy'))
  old.close()

  const app = createApp({ dbPath })
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${app.server.address().port}/api`
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
  const upload = async (who, name, text = 'content') =>
    (
      await fetch(base + '/files?name=' + encodeURIComponent(name), {
        method: 'POST',
        headers: headers(who, 'application/octet-stream'),
        body: Buffer.from(text),
      })
    ).json()
  try {
    for (const id of [
      'owner',
      'teacher',
      'other',
      'student',
      'second',
      'outsider',
    ]) {
      const r = await req('/login', id, 'POST', {
        email: id + '@example.test',
        password,
      })
      cookies[id] = r.headers.get('set-cookie').split(';')[0]
    }

    // The old BLOB is on disk now and served as before.
    assert.equal(
      app.db
        .prepare(
          `SELECT count(*) AS n FROM sqlite_master WHERE name='homework_files'`,
        )
        .get().n,
      0,
    )
    assert.equal(readFileSync(app.store.path('legacy-file'), 'utf8'), 'legacy')
    const legacy = await req('/files/legacy-file', 'teacher')
    assert.equal(legacy.status, 200)
    assert.equal(await legacy.text(), 'legacy')

    // Chat: a message may be only a file; readers of the thread see it.
    const photo = await upload('student', 'photo.png')
    const sent = await req('/messages/teacher', 'student', 'POST', {
      fileIds: [photo.id],
    })
    assert.equal(sent.status, 201)
    assert.equal((await sent.json()).files[0].name, 'photo.png')
    const thread = await (await req('/messages/student', 'teacher')).json()
    assert.equal(thread[0].files[0].id, photo.id)
    for (const who of ['student', 'teacher', 'owner'])
      assert.equal((await req('/files/' + photo.id, who)).status, 200)
    for (const who of ['other', 'second', 'outsider'])
      assert.equal((await req('/files/' + photo.id, who)).status, 404)
    assert.equal(
      (await req('/messages/teacher', 'student', 'POST', { text: '' })).status,
      400,
    )
    // A file is attached once.
    assert.equal(
      (
        await req('/messages/teacher', 'student', 'POST', {
          fileIds: [photo.id],
        })
      ).status,
      400,
    )
    // Staff-to-staff thread.
    const memo = await upload('teacher', 'memo.txt')
    await req('/messages/owner', 'teacher', 'POST', {
      text: 'см. файл',
      fileIds: [memo.id],
    })
    assert.equal((await req('/files/' + memo.id, 'owner')).status, 200)
    assert.equal((await req('/files/' + memo.id, 'other')).status, 404)

    // Library: all my students, selected students, school-wide from the owner.
    const pdf = await upload('teacher', 'Grammar.pdf')
    const material = {
      title: 'Grammar',
      description: 'Таблица времён',
      fileId: pdf.id,
      audience: 'all',
    }
    assert.equal(
      (await req('/library', 'student', 'POST', material)).status,
      403,
    )
    assert.equal(
      (
        await req('/library', 'teacher', 'POST', {
          ...material,
          audience: 'selected',
          studentIds: ['outsider'],
        })
      ).status,
      403,
    )
    const forAll = await (
      await req('/library', 'teacher', 'POST', material)
    ).json()
    assert.equal(forAll.file.name, 'Grammar.pdf')
    const sheet = await upload('teacher', 'Words.xlsx')
    const forOne = await (
      await req('/library', 'teacher', 'POST', {
        title: 'Words',
        fileId: sheet.id,
        audience: 'selected',
        studentIds: ['second'],
      })
    ).json()
    const rules = await upload('owner', 'Rules.docx')
    await req('/library', 'owner', 'POST', {
      title: 'Rules',
      fileId: rules.id,
      audience: 'all',
    })
    const titles = async (who) =>
      (await (await req('/library', who)).json()).map((i) => i.title).sort()
    assert.deepEqual(await titles('student'), ['Grammar', 'Rules'])
    assert.deepEqual(await titles('second'), ['Grammar', 'Rules', 'Words'])
    assert.deepEqual(await titles('outsider'), ['Rules'])
    assert.deepEqual(await titles('teacher'), ['Grammar', 'Words'])
    assert.deepEqual(await titles('other'), [])
    assert.equal((await titles('owner')).length, 3)
    assert.equal((await req('/files/' + sheet.id, 'second')).status, 200)
    assert.equal((await req('/files/' + sheet.id, 'student')).status, 404)
    assert.equal((await req('/files/' + pdf.id, 'outsider')).status, 404)
    assert.equal(
      (await (await req('/library', 'student')).json())[0].studentIds,
      undefined,
    )

    // 30 days later: chat files are gone, library files stay.
    await purgeFiles(app.db, app.store, new Date(Date.now() + 31 * 864e5))
    assert.equal((await req('/files/' + photo.id, 'teacher')).status, 410)
    assert.equal(existsSync(app.store.path(photo.id)), false)
    assert.equal(
      (await (await req('/messages/student', 'teacher')).json())[0].files[0]
        .deleted,
      true,
    )
    assert.equal((await req('/files/' + pdf.id, 'student')).status, 200)

    // Deleting a material removes its file.
    assert.equal(
      (await req('/library/' + forOne.id, 'other', 'DELETE', {})).status,
      403,
    )
    assert.equal(
      (await req('/library/' + forOne.id, 'teacher', 'DELETE', {})).status,
      200,
    )
    assert.equal(existsSync(app.store.path(sheet.id)), false)
    assert.deepEqual(await titles('second'), ['Grammar', 'Rules'])
  } finally {
    await new Promise((r) => app.server.close(r))
    rmSync(dir, { recursive: true, force: true })
  }
})
