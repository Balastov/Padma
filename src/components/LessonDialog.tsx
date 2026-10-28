import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Repeat } from 'lucide-react'
import {
  ApiError,
  api,
  friendlyDate,
  fullName,
  lessonIsUpcoming,
  lessonStatusNames,
} from '../api'
import type {
  Lesson,
  LessonConflict,
  LessonSeries,
  LessonStatus,
  User,
} from '../api'
import { describeRule } from '../lessonSeries'
import Modal from './Modal'
import ConflictNotice from './ConflictNotice'

type Props = {
  lesson: Lesson
  series?: LessonSeries
  users: User[]
  onClose: () => void
  onChanged: () => Promise<void>
}
type Scope = 'this' | 'following' | 'all'
const scopes: [Scope, string][] = [
  ['this', 'Только этот'],
  ['following', 'Этот и следующие'],
  ['all', 'Все уроки серии'],
]
export default function LessonDialog({
  lesson,
  series,
  users,
  onClose,
  onChanged,
}: Props) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const [form, setForm] = useState({
    date: lesson.date,
    start: lesson.start,
    end: lesson.end,
    title: lesson.title,
    note: lesson.note,
  })
  const [scope, setScope] = useState<Scope>('this')
  const [conflicts, setConflicts] = useState<LessonConflict[]>([])
  const [retry, setRetry] = useState<(() => void) | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const field = (key: keyof typeof form, value: string) => {
    setConflicts([])
    setForm((prev) => ({ ...prev, [key]: value }))
  }
  function switchMode(next: typeof mode) {
    setConflicts([])
    setError('')
    setMode(next)
  }
  async function run(
    action: (conflicts?: 'overlap') => Promise<unknown>,
    conflictMode?: 'overlap',
  ) {
    setBusy(true)
    setError('')
    setConflicts([])
    try {
      await action(conflictMode)
      await onChanged()
      onClose()
    } catch (e) {
      if (e instanceof ApiError && e.conflicts.length) {
        setConflicts(e.conflicts)
        setRetry(() => () => void run(action, 'overlap'))
      } else setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const setStatus = (status: LessonStatus) =>
    run((conflicts) =>
      api(`/lessons/${lesson.id}/status`, 'POST', { status, conflicts }),
    )
  function saveEdit(e: FormEvent) {
    e.preventDefault()
    void run((conflicts) =>
      api(`/lessons/${lesson.id}`, 'PATCH', { ...form, conflicts }),
    )
  }
  const started = !lessonIsUpcoming({ ...lesson, status: 'scheduled' })
  const student = users.find((u) => u.id === lesson.studentId)
  const feedback = (
    <>
      {conflicts.length > 0 && retry && (
        <ConflictNotice conflicts={conflicts} busy={busy} onOverlap={retry} />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  )
  return (
    <Modal titleId="lesson-title" onClose={onClose}>
      <p className="eyebrow">
        ЗАНЯТИЕ{lesson.seq ? ` · УРОК ${lesson.seq}` : ''}
      </p>
      <h2 id="lesson-title">{lesson.title}</h2>
      {lesson.status !== 'scheduled' && (
        <span className={`lesson-status lesson-status--${lesson.status}`}>
          {lessonStatusNames[lesson.status]}
        </span>
      )}
      <p>{fullName(student)}</p>
      <p>
        {friendlyDate(lesson.date)} · {lesson.start}–{lesson.end}
      </p>
      {series && (
        <p className="secondary lesson-dialog__rule">
          <Repeat size={15} aria-hidden="true" />
          {describeRule(series)}
        </p>
      )}
      {mode === 'view' && (
        <>
          {lesson.note && <p className="notice">{lesson.note}</p>}
          <div className="lesson-dialog__actions">
            {lesson.status === 'scheduled' ? (
              <>
                <button
                  className="button-secondary"
                  disabled={busy}
                  onClick={() => void setStatus('cancelled')}
                >
                  Отменить урок
                </button>
                {started && (
                  <button
                    className="button-secondary"
                    disabled={busy}
                    onClick={() => void setStatus('noshow')}
                  >
                    Неявка
                  </button>
                )}
              </>
            ) : (
              <button
                className="button-secondary"
                disabled={busy}
                onClick={() => void setStatus('scheduled')}
              >
                Вернуть в расписание
              </button>
            )}
            <button
              className="button-secondary"
              onClick={() => switchMode('edit')}
            >
              Изменить урок
            </button>
            {series && (
              <button
                className="button-secondary"
                onClick={() => {
                  onClose()
                  navigate(`/teacher/series/${series.id}?from=${lesson.id}`)
                }}
              >
                Изменить серию
              </button>
            )}
            <button
              className="button-danger"
              onClick={() => switchMode('delete')}
            >
              Удалить
            </button>
          </div>
          <p className="caption">
            «Отменён» и «Неявка» освобождают время и сдвигают темы серии.
            Отменённый урок не оплачивается и переносится в конец пакета, неявка
            засчитывается как проведённый.
          </p>
          {feedback}
          <div className="form-actions">
            <button className="button-secondary" autoFocus onClick={onClose}>
              Закрыть
            </button>
          </div>
        </>
      )}
      {mode === 'edit' && (
        <form className="form-stack lesson-dialog__form" onSubmit={saveEdit}>
          <label className="field">
            <span>Дата *</span>
            <input
              required
              type="date"
              value={form.date}
              onChange={(e) => field('date', e.target.value)}
            />
          </label>
          <div className="form-two">
            <label className="field">
              <span>Начало *</span>
              <input
                required
                type="time"
                value={form.start}
                onChange={(e) => field('start', e.target.value)}
              />
            </label>
            <label className="field">
              <span>Окончание *</span>
              <input
                required
                type="time"
                value={form.end}
                onChange={(e) => field('end', e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            <span>Тема урока</span>
            <input
              maxLength={200}
              value={form.title}
              onChange={(e) => field('title', e.target.value)}
            />
            {series && (
              <small>
                Изменится только этот урок. Своя тема заменяет тему из плана,
                плановая перейдёт на следующий урок. Очистите поле, чтобы
                вернуть тему из плана.
              </small>
            )}
          </label>
          <label className="field">
            <span>Заметка</span>
            <textarea
              rows={3}
              maxLength={500}
              value={form.note}
              onChange={(e) => field('note', e.target.value)}
            />
          </label>
          {feedback}
          <div className="form-actions">
            <button className="button-primary" disabled={busy}>
              {busy ? 'Сохраняем…' : 'Сохранить урок'}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => switchMode('view')}
            >
              Назад
            </button>
          </div>
        </form>
      )}
      {mode === 'delete' && (
        <>
          {series && (
            <div className="segmented lesson-dialog__scope">
              {scopes.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={scope === value}
                  className={scope === value ? 'active' : ''}
                  onClick={() => setScope(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <p className="secondary">
            Удаление стирает {scope === 'this' ? 'урок' : 'уроки'} без следа
            вместе со словами урока. Чтобы сохранить запись для оплаты, отметьте
            «Отменён» или «Неявка».
            {series &&
              scope === 'this' &&
              (series.endType === 'count'
                ? ' Темы сдвинутся, в конец пакета добавится урок.'
                : ' Темы следующих уроков сдвинутся.')}
          </p>
          {feedback}
          <div className="form-actions">
            <button
              className="button-danger"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  api(`/lessons/${lesson.id}`, 'DELETE', { scope }),
                )
              }
            >
              {busy ? 'Удаляем…' : 'Удалить'}
            </button>
            <button
              className="button-secondary"
              onClick={() => switchMode('view')}
            >
              Назад
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
