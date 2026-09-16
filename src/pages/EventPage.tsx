import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarPlus } from 'lucide-react'
import { api, moscowToday, dateKey, fullName } from '../api'
import type { Lesson, User } from '../api'
import Calendar from '../components/Calendar'
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
    repeat: false,
    weeks: 4,
  })
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const field = (key: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/lessons', 'POST', form)
      await onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
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
              <label className="toggle-label">
                <span>Повторять каждую неделю</span>
                <input
                  type="checkbox"
                  checked={form.repeat}
                  onChange={(e) => field('repeat', e.target.checked)}
                />
              </label>
              {form.repeat && (
                <label className="field">
                  <span>Количество занятий, включая первое</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={form.weeks}
                    onChange={(e) => field('weeks', Number(e.target.value))}
                  />
                  <small>
                    До 12 недель. Пересечения проверяются для всей серии.
                  </small>
                </label>
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
