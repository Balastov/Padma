import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { BookOpen, Download } from 'lucide-react'
import { api, friendlyDate, fullName } from '../api'
import type { User } from '../api'
import './Homework.css'

type Submission = {
  id: string
  text: string
  created: string
  status: 'submitted' | 'returned' | 'accepted'
  comment: string
  files: { id: string; name: string; size: number }[]
}
type Assignment = {
  id: string
  studentId: string
  title: string
  description: string
  due: string
  submissions: Submission[]
}
const statuses = {
  submitted: 'На проверке',
  returned: 'Нужна доработка',
  accepted: 'Принято',
}
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
    try {
      await api('/homework', 'POST', Object.fromEntries(fields))
      form.reset()
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
              <label>
                Сдать до (Москва)
                <input type="date" name="due" />
              </label>
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
      {!ready && !error && <p role="status">Загружаем задания…</p>}
      {ready && !items.length && (
        <p className="secondary">
          {students
            ? 'Выданных заданий пока нет.'
            : 'Учитель ещё не выдал домашнее задание.'}
        </p>
      )}
      {items.map((item) => (
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
  const last = item.submissions.at(-1)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (
        files.length > 5 ||
        files.reduce((sum, f) => sum + f.size, 0) > 10 * 1024 * 1024
      )
        throw new Error('До 5 файлов общим размером не более 10 МБ')
      const attachments = await Promise.all(
        files.map(
          (file) =>
            new Promise<{ name: string; data: string }>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () =>
                resolve({
                  name: file.name,
                  data: String(reader.result).split(',')[1],
                })
              reader.onerror = () =>
                reject(new Error('Не удалось прочитать файл'))
              reader.readAsDataURL(file)
            }),
        ),
      )
      await api('/homework/' + item.id + '/submit', 'POST', {
        text: answer,
        files: attachments,
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
  return (
    <article className="hw__card">
      <div className="hw__head">
        <h3>{item.title}</h3>
        <span className="subtle-badge">
          {last ? statuses[last.status] : 'К выполнению'}
        </span>
      </div>
      {studentName && <p className="secondary">{studentName}</p>}
      {item.due && (
        <p className="hw__deadline">
          Сдать до {friendlyDate(item.due)} · Москва
        </p>
      )}
      <p className="hw__text">{item.description}</p>
      {!!item.submissions.length && (
        <details className="hw__history" open={last?.status !== 'accepted'}>
          <summary>История работы ({item.submissions.length})</summary>
          {item.submissions.map((s, i) => (
            <div className="hw__version" key={s.id}>
              <strong>
                Отправка {i + 1} · {statuses[s.status]}
              </strong>
              <small>{stamp(s.created)} · Москва</small>
              {s.text && <p className="hw__text">{s.text}</p>}
              {s.files.map((f) => (
                <a
                  key={f.id}
                  className="hw__file"
                  href={'/api/homework/files/' + f.id}
                  download
                >
                  <Download size={16} />
                  <span>
                    {f.name} ({Math.ceil(f.size / 1024)} КБ)
                  </span>
                </a>
              ))}
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
          <label>
            Файлы ответа
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
          </label>
          <small className="secondary">
            PDF, DOC, DOCX, JPG, PNG · до 5 файлов, всего до 10 МБ. Напишите
            ответ или приложите файл.
          </small>
          <button
            className="button-primary"
            disabled={busy || (!answer.trim() && !files.length)}
          >
            {busy ? 'Отправляем…' : 'Отправить на проверку'}
          </button>
        </form>
      )}
      {teacher && last?.status === 'submitted' && (
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
              Принять работу
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </article>
  )
}
