import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Repeat } from 'lucide-react'
import { ApiError, api, fullName } from '../api'
import type { Lesson, LessonConflict, Recurrence, User } from '../api'
import Calendar from '../components/Calendar'
import ConflictNotice from '../components/ConflictNotice'
import LessonTimeFields from '../components/LessonTimeFields'
import RecurrenceFields from '../components/RecurrenceFields'
import { isoWeekday, newRecurrence } from '../lessonSeries'

type Props = {
  users: User[]
  lessons: Lesson[]
  onSaved: () => Promise<void>
}
type First = { date: string; start: string; end: string }

/** The rule still mirrors the first lesson: one day with its weekday and time. */
const mirrors = (rule: Recurrence, first: First) =>
  rule.days.length === 1 &&
  rule.days[0].weekday === isoWeekday(first.date) &&
  rule.days[0].start === first.start &&
  rule.days[0].end === first.end

/** A single lesson becomes the first lesson of a new series. */
export default function SeriesFromLessonPage({
  users,
  lessons,
  onSaved,
}: Props) {
  const { id } = useParams()
  const navigate = useNavigate()
  const lesson = lessons.find((l) => l.id === id && !l.seriesId)
  const [first, setFirst] = useState<First>({
    date: lesson?.date || '',
    start: lesson?.start || '',
    end: lesson?.end || '',
  })
  const [rule, setRule] = useState<Recurrence>(() =>
    newRecurrence(first.date, first.start, first.end),
  )
  const [texts, setTexts] = useState({
    title: lesson?.title || '',
    note: lesson?.note || '',
  })
  const [conflicts, setConflicts] = useState<LessonConflict[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!lesson)
    return (
      <div className="empty-state glass-panel">
        <p>Урок не найден или уже входит в серию.</p>
        <button className="button-primary" onClick={() => navigate('/teacher')}>
          К расписанию
        </button>
      </div>
    )
  // While the rule repeats the first lesson, it follows its changes.
  function changeFirst(next: First) {
    setConflicts([])
    if (mirrors(rule, first) && next.date && next.start && next.end)
      setRule({
        ...rule,
        days: [
          { weekday: isoWeekday(next.date), start: next.start, end: next.end },
        ],
      })
    setFirst(next)
  }
  async function save(mode?: 'skip' | 'overlap') {
    setBusy(true)
    setError('')
    try {
      await api(`/lessons/${lesson?.id}/series`, 'POST', {
        ...first,
        ...texts,
        recurrence: rule,
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
  const student = users.find((u) => u.id === lesson.studentId)
  // The first lesson itself cannot be left out, only the following dates.
  const firstBusy = conflicts.some(
    (c) => c.date === first.date && c.start === first.start,
  )
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Серия из урока</h1>
          <p>
            {fullName(student)}. Этот урок станет первым в серии. Время —
            Москва, UTC+3.
          </p>
        </div>
      </header>
      <div className="event-layout">
        <section className="glass-panel event-form">
          <h2>
            <Repeat size={20} aria-hidden="true" /> Правило повторения
          </h2>
          <form className="form-stack" onSubmit={submit}>
            <fieldset className="recurrence__group">
              <legend>Первый урок</legend>
              <label className="field">
                <span>Дата *</span>
                <input
                  required
                  type="date"
                  value={first.date}
                  onChange={(e) =>
                    changeFirst({ ...first, date: e.target.value })
                  }
                />
              </label>
              <LessonTimeFields
                start={first.start}
                end={first.end}
                onChange={(times) => changeFirst({ ...first, ...times })}
              />
            </fieldset>
            <p className="caption">
              Следующие уроки пойдут по правилу со следующего дня после первого
              урока.
            </p>
            <RecurrenceFields
              value={rule}
              startDate={first.date}
              onChange={(value) => {
                setConflicts([])
                setRule(value)
              }}
            />
            <label className="field">
              <span>Тема по умолчанию</span>
              <input
                maxLength={200}
                value={texts.title}
                onChange={(e) => setTexts({ ...texts, title: e.target.value })}
              />
            </label>
            <label className="field">
              <span>
                Заметка <small>для всех уроков серии</small>
              </span>
              <textarea
                rows={3}
                maxLength={500}
                value={texts.note}
                onChange={(e) => setTexts({ ...texts, note: e.target.value })}
              />
            </label>
            {conflicts.length > 0 && (
              <ConflictNotice
                conflicts={conflicts}
                busy={busy}
                onSkip={firstBusy ? undefined : () => void save('skip')}
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
                {busy ? 'Сохраняем…' : 'Создать серию'}
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
        </section>
        <Calendar lessons={lessons} users={users} compact />
      </div>
    </>
  )
}
