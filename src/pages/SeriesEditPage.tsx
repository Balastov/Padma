import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Repeat } from 'lucide-react'
import { ApiError, api, friendlyDate, fullName } from '../api'
import type {
  Lesson,
  LessonConflict,
  LessonSeries,
  Recurrence,
  User,
} from '../api'
import Calendar from '../components/Calendar'
import ConflictNotice from '../components/ConflictNotice'
import RecurrenceFields from '../components/RecurrenceFields'

type Props = {
  users: User[]
  lessons: Lesson[]
  series: LessonSeries[]
  onSaved: () => Promise<void>
}
export default function SeriesEditPage({
  users,
  lessons,
  series,
  onSaved,
}: Props) {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const current = series.find((s) => s.id === id)
  const from = lessons.find(
    (l) => l.id === params.get('from') && l.seriesId === id,
  )
  const hasEarlier = Boolean(
    from &&
    lessons.some(
      (l) => l.seriesId === id && l.date + l.start < from.date + from.start,
    ),
  )
  const [scope, setScope] = useState<'following' | 'all'>(
    hasEarlier ? 'following' : 'all',
  )
  const [startDate, setStartDate] = useState(from?.date || '')
  const [rule, setRule] = useState<Recurrence | null>(() =>
    current
      ? {
          everyWeeks: current.everyWeeks,
          days: current.days,
          endType: current.endType,
          until: current.until,
          count: current.count,
          plan: current.plan,
        }
      : null,
  )
  const [texts, setTexts] = useState({
    title: current?.title || '',
    note: current?.note || '',
  })
  const [conflicts, setConflicts] = useState<LessonConflict[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!current || !rule)
    return (
      <div className="empty-state glass-panel">
        <p>Серия не найдена — возможно, её уже удалили.</p>
        <button className="button-primary" onClick={() => navigate('/teacher')}>
          К расписанию
        </button>
      </div>
    )
  const following = scope === 'following' && from
  async function save(mode?: 'skip' | 'overlap') {
    setBusy(true)
    setError('')
    try {
      await api(`/lesson-series/${current?.id}`, 'PUT', {
        scope: following ? 'following' : 'all',
        fromLessonId: from?.id,
        startDate: following ? startDate : undefined,
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
  const student = users.find((u) => u.id === current.studentId)
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Серия уроков</h1>
          <p>
            {fullName(student)} · с {friendlyDate(current.startDate)}. Время —
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
            {from && (
              <div className="segmented">
                <button
                  type="button"
                  aria-pressed={scope === 'following'}
                  className={scope === 'following' ? 'active' : ''}
                  onClick={() => setScope('following')}
                >
                  С урока {friendlyDate(from.date)}
                </button>
                <button
                  type="button"
                  aria-pressed={scope === 'all'}
                  className={scope === 'all' ? 'active' : ''}
                  onClick={() => setScope('all')}
                >
                  Все уроки серии
                </button>
              </div>
            )}
            <p className="caption">
              {following
                ? 'Уроки до выбранного останутся как есть, начиная с него серия пойдёт по новому правилу. Нумерация, план тем и пакет уроков продолжатся.'
                : 'Прошедшие уроки не изменятся. Будущие перестроятся по новому правилу, слова уроков сохранятся.'}
            </p>
            {following && (
              <label className="field">
                <span>Новое правило действует с *</span>
                <input
                  required
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
            )}
            <RecurrenceFields
              value={rule}
              startDate={following ? startDate : current.startDate}
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
                Заметка <small>для будущих уроков</small>
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
                onSkip={() => void save('skip')}
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
                {busy ? 'Сохраняем…' : 'Сохранить серию'}
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
