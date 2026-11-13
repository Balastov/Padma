import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  Pencil,
  Trash2,
  Volume2,
} from 'lucide-react'
import { api, friendlyDate, fullName } from '../api'
import type { User } from '../api'
import { MAX_FILES, uploadAll } from '../files'
import type { StoredFile } from '../files'
import { FileLinks, FilePicker } from './Attachments'
import HomeworkLexicon from './HomeworkLexicon'
import { sourceLabel, wordsCount } from './lexiconFormat'
import type { LexiconSource } from './HomeworkLexicon'
import { playWordAudio } from '../student/audio'
import Modal from './Modal'
import './Homework.css'

type Submission = {
  id: string
  text: string
  created: string
  status: 'submitted' | 'returned' | 'accepted'
  comment: string
  reviewed: string | null
  files: StoredFile[]
}
type Assignment = {
  id: string
  studentId: string
  title: string
  description: string
  due: string
  status: Status
  archived: boolean
  /** Owner, admin or the student's teacher: edit, archive, delete. */
  canManage: boolean
  /** Teacher's files for the task. */
  files: StoredFile[]
  submissions: Submission[]
  lexicon: {
    sources: {
      id: number
      kind: string
      title: string
      parentTitle: string
      count: number
    }[]
    words: {
      id: string
      term: string
      translation: string
      transcription: string
    }[]
  }
}
/** Computed by the server; returned work is assigned again. */
const statuses = {
  assigned: 'Назначено',
  review: 'На проверке',
  done: 'Выполнено',
  overdue: 'Просрочено',
}
type Status = keyof typeof statuses
const versionNames: Record<Submission['status'], string> = {
  submitted: 'На проверке',
  returned: 'Возвращено на доработку',
  accepted: 'Выполнено',
}
/** Completed homework is deleted for good after this many days. */
const DONE_KEEP_DAYS = 30
const stamp = (value: string) =>
  new Date(value).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'short',
    timeStyle: 'short',
  })

export default function Homework({ students }: { students?: User[] }) {
  const [items, setItems] = useState<Assignment[]>([])
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lexicon, setLexicon] = useState<LexiconSource[]>([])
  const [taskFiles, setTaskFiles] = useState<File[]>([])
  const [notice, setNotice] = useState('')
  const [studentFilter, setStudentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<Status | ''>('')
  const [archiveOnly, setArchiveOnly] = useState(false)
  const filtering = !!(studentFilter || statusFilter || archiveOnly)
  const current = items.filter((item) => item.archived === archiveOnly)
  const visible = current.filter(
    (item) =>
      (!studentFilter || item.studentId === studentFilter) &&
      (!statusFilter || item.status === statusFilter),
  )
  const archivedCount = items.filter((item) => item.archived).length
  const refresh = useCallback(async () => {
    try {
      setItems(await api<Assignment[]>('/homework'))
      setError('')
      setReady(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => {
    let active = true
    api<Assignment[]>('/homework')
      .then((data) => {
        if (active) {
          setItems(data)
          setReady(true)
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [refresh])
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget,
      fields = new FormData(form)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const fileIds = await uploadAll(taskFiles)
      const created = await api<{ duplicatesSkipped: number }>(
        '/homework',
        'POST',
        {
          ...Object.fromEntries(fields),
          lexicon: lexicon.map((s) => ({
            kind: s.kind,
            id: s.id,
            termIds: s.checked,
          })),
          fileIds,
        },
      )
      form.reset()
      setLexicon([])
      setTaskFiles([])
      if (created.duplicatesSkipped)
        setNotice(
          `Задание выдано. Повторы исключены: ${created.duplicatesSkipped}.`,
        )
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="hw glass-panel">
      <div className="hw__head">
        <h2>
          <BookOpen size={20} /> Домашние задания
        </h2>
        <button className="text-button" onClick={refresh}>
          Обновить
        </button>
      </div>
      {students && (
        <details className="hw__create">
          <summary>Выдать задание</summary>
          {students.length ? (
            <form onSubmit={create} className="hw__form">
              <label>
                Ученик
                <select name="studentId" required defaultValue="">
                  <option value="" disabled>
                    Выберите ученика
                  </option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {fullName(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Название задания
                <input name="title" required maxLength={200} />
              </label>
              <label>
                Описание задания
                <textarea
                  name="description"
                  required
                  maxLength={10000}
                  rows={4}
                />
              </label>
              <FilePicker
                files={taskFiles}
                onChange={setTaskFiles}
                disabled={busy}
              />
              <label>
                Сдать до (Москва)
                <input type="date" name="due" />
              </label>
              <HomeworkLexicon value={lexicon} onChange={setLexicon} />
              <button className="button-primary" disabled={busy}>
                {busy ? 'Сохраняем…' : 'Выдать задание'}
              </button>
            </form>
          ) : (
            <p>Сначала добавьте ученика.</p>
          )}
        </details>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {!ready && !error && <p role="status">Загружаем задания…</p>}
      {ready && !items.length && !archiveOnly && (
        <p className="secondary">
          {students
            ? 'Выданных заданий пока нет.'
            : 'Учитель ещё не выдал домашнее задание.'}
        </p>
      )}
      {students && (!!items.length || archiveOnly) && (
        <div className="hw__filters" role="group" aria-label="Фильтры заданий">
          <label>
            Ученик
            <select
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
            >
              <option value="">Все ученики</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Статус
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as Status | '')}
            >
              <option value="">Все статусы</option>
              {(Object.keys(statuses) as Status[]).map((key) => (
                <option key={key} value={key}>
                  {statuses[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="hw__filter-check">
            <input
              type="checkbox"
              checked={archiveOnly}
              onChange={(e) => setArchiveOnly(e.target.checked)}
            />
            Архив{archivedCount ? ` (${archivedCount})` : ''}
          </label>
          <span className="caption hw__filter-count">
            {filtering
              ? `Показано ${visible.length} из ${current.length}`
              : `Всего: ${current.length}`}
          </span>
          {filtering && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setStudentFilter('')
                setStatusFilter('')
                setArchiveOnly(false)
              }}
            >
              Сбросить
            </button>
          )}
        </div>
      )}
      {filtering && !visible.length && (
        <p className="secondary">
          {archiveOnly && !current.length
            ? 'В архиве пока пусто.'
            : 'Нет заданий по выбранным фильтрам.'}
        </p>
      )}
      {visible.map((item) => (
        <AssignmentCard
          key={item.id}
          item={item}
          teacher={!!students}
          studentName={
            students
              ? fullName(students.find((s) => s.id === item.studentId))
              : undefined
          }
          onSaved={refresh}
        />
      ))}
    </section>
  )
}
function AssignmentCard({
  item,
  teacher,
  studentName,
  onSaved,
}: {
  item: Assignment
  teacher: boolean
  studentName?: string
  onSaved: () => Promise<void>
}) {
  const [answer, setAnswer] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const last = item.submissions.at(-1)
  const removal =
    item.status === 'done' && last?.reviewed
      ? new Date(Date.parse(last.reviewed) + DONE_KEEP_DAYS * 864e5)
      : null
  async function act(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await action()
      setMode('view')
      await onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api('/homework/' + item.id + '/submit', 'POST', {
        text: answer,
        fileIds: await uploadAll(files),
      })
      setAnswer('')
      setFiles([])
      await onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function review(status: 'accepted' | 'returned') {
    setBusy(true)
    setError('')
    try {
      await api('/homework/' + item.id + '/review', 'POST', {
        status,
        comment,
        submissionId: last?.id,
      })
      setComment('')
      await onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  if (mode === 'edit')
    return (
      <article className="hw__card">
        <EditForm
          item={item}
          onCancel={() => setMode('view')}
          onSaved={async () => {
            setMode('view')
            await onSaved()
          }}
        />
      </article>
    )
  return (
    <article className={`hw__card${item.archived ? ' is-archived' : ''}`}>
      <div className="hw__head">
        <h3>{item.title}</h3>
        <span className="hw__badges">
          {item.archived && <span className="subtle-badge">В архиве</span>}
          <span
            className={`subtle-badge hw__status hw__status--${item.status}`}
          >
            {statuses[item.status]}
          </span>
        </span>
      </div>
      {studentName && <p className="secondary">{studentName}</p>}
      {item.due && (
        <p className="hw__deadline">
          Сдать до {friendlyDate(item.due)} · Москва
        </p>
      )}
      {removal && (
        <p className="hw__deadline">
          Выполненное задание будет удалено{' '}
          {removal.toLocaleDateString('ru-RU', {
            timeZone: 'Europe/Moscow',
            day: 'numeric',
            month: 'long',
          })}
        </p>
      )}
      <p className="hw__text">{item.description}</p>
      <FileLinks files={item.files} />
      {!!item.lexicon?.words.length && (
        <details className="hw__lexicon">
          <summary>Лексика · {wordsCount(item.lexicon.words.length)}</summary>
          {teacher && (
            <ul className="hw__lexicon-sources">
              {item.lexicon.sources.map((s) => (
                <li key={s.id}>
                  {s.kind === 'subtopic' ? 'Подтема' : s.kind === 'topic' ? 'Тема' : ''}{' '}
                  <strong>{sourceLabel(s)}</strong> · {wordsCount(s.count)}
                </li>
              ))}
            </ul>
          )}
          <ul className="hw__words">
            {item.lexicon.words.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Произношение: ${w.term}`}
                  onClick={() => void playWordAudio(w.term)}
                >
                  <Volume2 size={16} />
                </button>
                <span className="hw__word">{w.term}</span>
                {w.transcription && (
                  <span className="hw__ipa">{w.transcription}</span>
                )}
                <span className="hw__translation">{w.translation}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!!item.submissions.length && (
        <details className="hw__history" open={last?.status !== 'accepted'}>
          <summary>История работы ({item.submissions.length})</summary>
          {item.submissions.map((s, i) => (
            <div className="hw__version" key={s.id}>
              <strong>
                Отправка {i + 1} · {versionNames[s.status]}
              </strong>
              <small>{stamp(s.created)} · Москва</small>
              {s.text && <p className="hw__text">{s.text}</p>}
              <FileLinks files={s.files} />
              {s.comment && (
                <p className="hw__text notice">
                  <strong>Комментарий учителя: </strong>
                  {s.comment}
                </p>
              )}
            </div>
          ))}
        </details>
      )}
      {!teacher && (!last || last.status === 'returned') && (
        <form className="hw__form" onSubmit={submit}>
          <label>
            Ваш ответ
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              maxLength={10000}
              rows={3}
            />
          </label>
          <FilePicker files={files} onChange={setFiles} disabled={busy} />
          <small className="secondary">
            Напишите ответ или приложите файл — до 5 файлов.
          </small>
          <button
            className="button-primary"
            disabled={busy || (!answer.trim() && !files.length)}
          >
            {busy ? 'Отправляем…' : 'Отправить учителю'}
          </button>
        </form>
      )}
      {teacher && !item.archived && last?.status === 'submitted' && (
        <div className="hw__form">
          <label>
            Комментарий к работе
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={10000}
              rows={3}
            />
          </label>
          <div className="hw__actions">
            <button
              className="button-secondary"
              disabled={busy || !comment.trim()}
              onClick={() => review('returned')}
            >
              Вернуть на доработку
            </button>
            <button
              className="button-primary"
              disabled={busy}
              onClick={() => review('accepted')}
            >
              Выполнено
            </button>
          </div>
        </div>
      )}
      {item.canManage && (
        <div className="hw__manage">
          {!item.archived && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setMode('edit')}
            >
              <Pencil size={15} aria-hidden="true" />
              Изменить
            </button>
          )}
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() =>
              void act(() =>
                api('/homework/' + item.id + '/archive', 'POST', {
                  archived: !item.archived,
                }),
              )
            }
          >
            {item.archived ? (
              <ArchiveRestore size={15} aria-hidden="true" />
            ) : (
              <Archive size={15} aria-hidden="true" />
            )}
            {item.archived ? 'Вернуть из архива' : 'В архив'}
          </button>
          <button
            type="button"
            className="text-button hw__delete"
            disabled={busy}
            onClick={() => setMode('delete')}
          >
            <Trash2 size={15} aria-hidden="true" />
            Удалить
          </button>
        </div>
      )}
      {mode === 'delete' && (
        <Modal titleId={'hw-delete-' + item.id} onClose={() => setMode('view')}>
          <h2 id={'hw-delete-' + item.id}>Удалить задание?</h2>
          <p>
            «{item.title}»{studentName ? ` · ${studentName}` : ''}
          </p>
          <p className="secondary">
            Задание, ответы ученика, комментарии и все файлы будут удалены
            безвозвратно. Чтобы только скрыть задание, отправьте его в архив.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button-secondary"
              autoFocus
              disabled={busy}
              onClick={() => setMode('view')}
            >
              Отмена
            </button>
            <button
              type="button"
              className="button-danger"
              disabled={busy}
              onClick={() =>
                void act(() => api('/homework/' + item.id, 'DELETE'))
              }
            >
              {busy ? 'Удаляем…' : 'Удалить навсегда'}
            </button>
          </div>
        </Modal>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </article>
  )
}
function EditForm({
  item,
  onCancel,
  onSaved,
}: {
  item: Assignment
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const [form, setForm] = useState({
    title: item.title,
    description: item.description,
    due: item.due,
  })
  const [removed, setRemoved] = useState<string[]>([])
  const [added, setAdded] = useState<File[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const kept = item.files.filter((f) => !removed.includes(f.id)).length
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/homework/' + item.id, 'PATCH', {
        ...form,
        removeFileIds: removed,
        fileIds: await uploadAll(added),
      })
      await onSaved()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }
  return (
    <form className="hw__form" onSubmit={save}>
      <h3>Изменить задание</h3>
      <label>
        Название задания
        <input
          required
          maxLength={200}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </label>
      <label>
        Описание задания
        <textarea
          required
          maxLength={10000}
          rows={4}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>
      <label>
        Сдать до (Москва)
        <input
          type="date"
          value={form.due}
          onChange={(e) => setForm({ ...form, due: e.target.value })}
        />
      </label>
      {!!item.files.length && (
        <fieldset className="hw__edit-files">
          <legend>Файлы задания</legend>
          {item.files.map((f) => (
            <label key={f.id} className="hw__filter-check">
              <input
                type="checkbox"
                checked={!removed.includes(f.id)}
                onChange={(e) =>
                  setRemoved(
                    e.target.checked
                      ? removed.filter((id) => id !== f.id)
                      : [...removed, f.id],
                  )
                }
              />
              {f.name}
              {f.deleted && ' — удалён по сроку хранения'}
            </label>
          ))}
          <small className="secondary">
            Снимите отметку, чтобы удалить файл при сохранении.
          </small>
        </fieldset>
      )}
      {kept < MAX_FILES ? (
        <FilePicker
          files={added}
          onChange={setAdded}
          disabled={busy}
          max={MAX_FILES - kept}
        />
      ) : (
        <small className="secondary">
          У задания уже {MAX_FILES} файлов — снимите отметку, чтобы заменить.
        </small>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="hw__actions">
        <button
          type="button"
          className="button-secondary"
          disabled={busy}
          onClick={onCancel}
        >
          Отмена
        </button>
        <button className="button-primary" disabled={busy}>
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
    </form>
  )
}
