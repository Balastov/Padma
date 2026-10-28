import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarPlus } from 'lucide-react'
import { ApiError, api, moscowToday, dateKey, fullName } from '../api'
import type { Lesson, LessonConflict, Recurrence, User } from '../api'
import Calendar from '../components/Calendar'
import ConflictNotice from '../components/ConflictNotice'
import RecurrenceFields from '../components/RecurrenceFields'
import { newRecurrence } from '../lessonSeries'
export default function EventPage({
  users,
  lessons,
  onSaved,
}: {
  users: User[]
  lessons: Lesson[]
  onSaved: () => Promise<void>
}) {
  const [params] = useSearchParams(),
    navigate = useNavigate()
  const students = users.filter(
    (u) => u.roles.includes('student') && u.teacherId,
  )
  const [form, setForm] = useState({
    studentId: students[0]?.id || '',
    date: params.get('date') || dateKey(moscowToday()),
    start: '14:00',
    end: '14:50',
    title: '',
    note: '',
  })
  const [recurrence, setRecurrence] = useState<Recurrence | null>(null)
  const [conflicts, setConflicts] = useState<LessonConflict[]>([])
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const field = (key: string, value: unknown) => {
    setConflicts([])
    setForm((prev) => ({ ...prev, [key]: value }))
  }
  async function save(mode?: 'skip' | 'overlap') {
    setBusy(true)
    setError('')
    try {
      await api('/lessons', 'POST', {
        ...form,
        recurrence: recurrence || undefined,
        conflicts: mode,
      })
      await onSaved()
    } catch (e) {
      if (e instanceof ApiError && e.conflicts.length) setConflicts(e.conflicts)
      else setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    void save()
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Новое событие</h1>
          <p>
            Создайте занятие и сразу добавьте детали. Время — Москва, UTC+3.
          </p>
        </div>
      </header>
      <div className="event-layout">
        <section className="glass-panel event-form">
          <h2>Детали события</h2>
          {!students.length ? (
            <div className="empty-state">
              <p>Для занятия нужен ученик с назначенным учителем.</p>
              <button
                className="button-primary"
                onClick={() => navigate('/teacher/students')}
              >
                Перейти к ученикам
              </button>
            </div>
          ) : (
            <form className="form-stack" onSubmit={submit}>
              <label className="field">
                <span>Ученик *</span>
                <select
                  required
                  value={form.studentId}
                  onChange={(e) => field('studentId', e.target.value)}
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {fullName(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{recurrence ? 'Начало серии *' : 'Дата *'}</span>
                <input
                  required
                  type="date"
                  value={form.date}
                  onChange={(e) => field('date', e.target.value)}
                />
              </label>
              {!recurrence && (
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
              )}
              <label className="toggle-label">
                <span>Повторять урок</span>
                <input
                  type="checkbox"
                  checked={Boolean(recurrence)}
                  onChange={(e) => {
                    setConflicts([])
                    setRecurrence(
                      e.target.checked
                        ? newRecurrence(form.date, form.start, form.end)
                        : null,
                    )
                  }}
                />
              </label>
              {recurrence && (
                <RecurrenceFields
                  value={recurrence}
                  startDate={form.date}
                  onChange={(value) => {
                    setConflicts([])
                    setRecurrence(value)
                  }}
                />
              )}
              <label className="field">
                <span>{recurrence ? 'Тема по умолчанию' : 'Тема урока'}</span>
                <input
                  maxLength={200}
                  placeholder="Например, грамматика: Past Simple"
                  value={form.title}
                  onChange={(e) => field('title', e.target.value)}
                />
              </label>
              <label className="field">
                <span>
                  Заметка <small>необязательно</small>
                </span>
                <textarea
                  rows={4}
                  maxLength={500}
                  placeholder="Что важно повторить на занятии?"
                  value={form.note}
                  onChange={(e) => field('note', e.target.value)}
                />
                <small className="character-count">
                  {form.note.length}/500
                </small>
              </label>
              {conflicts.length > 0 && (
                <ConflictNotice
                  conflicts={conflicts}
                  busy={busy}
                  onSkip={recurrence ? () => void save('skip') : undefined}
                  onOverlap={() => void save('overlap')}
                />
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button disabled={busy} className="button-primary">
                  <CalendarPlus size={19} />
                  {busy ? 'Сохраняем…' : 'Сохранить событие'}
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => navigate('/teacher')}
                >
                  Отмена
                </button>
              </div>
            </form>
          )}
        </section>
        <Calendar lessons={lessons} users={users} compact />
      </div>
    </>
  )
}
