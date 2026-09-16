import { useState } from 'react'
import { layoutDay } from '../calendarLayout'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { moscowToday, dateKey, fullName, weekDays } from '../api'
import type { Lesson, User } from '../api'
type Props = {
  lessons: Lesson[]
  users: User[]
  onNew?: (date?: string) => void
  onSelect?: (lesson: Lesson) => void
  compact?: boolean
}
export default function Calendar({
  lessons,
  users,
  onNew,
  onSelect,
  compact,
}: Props) {
  const [anchor, setAnchor] = useState(moscowToday)
  const [view, setView] = useState('week')
  const days = weekDays(anchor),
    today = dateKey(moscowToday())
  const step = (n: number) => {
    const d = new Date(anchor)
    d.setDate(d.getDate() + n * 7)
    setAnchor(d)
  }
  const weekLessons = lessons.filter(
    (l) => l.date >= dateKey(days[0]) && l.date <= dateKey(days[6]),
  )
  const earliest = Math.min(
    8,
    ...weekLessons.map((l) => Number(l.start.slice(0, 2))),
  )
  const latest = Math.max(
    20,
    ...weekLessons.map((l) =>
      Math.ceil((Number(l.end.slice(0, 2)) * 60 + Number(l.end.slice(3))) / 60),
    ),
  )
  const hours = Array.from(
    { length: latest - earliest },
    (_, i) => earliest + i,
  )
  return (
    <section
      className={`calendar glass-panel${compact ? ' calendar--compact' : ''}`}
    >
      <div className="section-heading calendar__heading">
        <div>
          <h2>Расписание на неделю</h2>
          <small className="caption">Москва · UTC+3</small>
        </div>
        <div className="calendar__tools">
          <button
            className="icon-button"
            aria-label="Предыдущая неделя"
            onClick={() => step(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="button-secondary button-small"
            onClick={() => setAnchor(moscowToday())}
          >
            Сегодня
          </button>
          <button
            className="icon-button"
            aria-label="Следующая неделя"
            onClick={() => step(1)}
          >
            <ChevronRight size={18} />
          </button>
          <span className="calendar__range">
            {days[0].getDate()} –{' '}
            {days[6].toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
          {!compact && (
            <select
              aria-label="Вид календаря"
              value={view}
              onChange={(e) => setView(e.target.value)}
            >
              <option value="week">Неделя</option>
              <option value="agenda">Список</option>
            </select>
          )}
          {onNew && !compact && (
            <button
              className="button-primary button-small"
              onClick={() => onNew()}
            >
              <Plus size={17} />
              Новое событие
            </button>
          )}
        </div>
      </div>
      <div
        className={`calendar__scroll${view === 'agenda' ? ' is-agenda' : ''}`}
      >
        <div
          className="calendar__grid"
          style={{ minHeight: hours.length * 52 + 58 }}
        >
          <div className="calendar__times">
            <div className="calendar__day-head" />
            {hours.map((h) => (
              <span key={h}>{String(h).padStart(2, '0')}:00</span>
            ))}
          </div>
          {days.map((day) => {
            const key = dateKey(day)
            return (
              <div
                key={key}
                className={`calendar__day${key === today ? ' is-today' : ''}`}
              >
                <button
                  className="calendar__day-head"
                  onClick={() => onNew?.(key)}
                  disabled={!onNew}
                >
                  <span>
                    {day.toLocaleDateString('ru-RU', { weekday: 'short' })}
                  </span>
                  <strong>
                    {day.toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </strong>
                </button>
                <div
                  className="calendar__slots"
                  style={{ height: hours.length * 52 }}
                >
                  {hours.map((h) => (
                    <div className="calendar__slot" key={h} />
                  ))}
                  {layoutDay(weekLessons.filter((l) => l.date === key)).map(
                    ({ lesson: l, lane, lanes }) => {
                      const start =
                        Number(l.start.slice(0, 2)) * 60 +
                        Number(l.start.slice(3))
                      const end =
                        Number(l.end.slice(0, 2)) * 60 + Number(l.end.slice(3))
                      return (
                        <button
                          key={l.id}
                          title={`${fullName(users.find((u) => u.id === l.studentId))} · ${l.start}–${l.end} · ${l.title}`}
                          disabled={!onSelect}
                          className={`calendar__event tone-${['blue', 'green', 'purple', 'pink'][l.studentId.charCodeAt(0) % 4]}`}
                          style={{
                            left: `calc(${(lane / lanes) * 100}% + 3px)`,
                            width: `calc(${100 / lanes}% - 6px)`,
                            top: (start / 60 - earliest) * 52,
                            height: Math.max(((end - start) / 60) * 52 - 3, 24),
                          }}
                          onClick={() => onSelect?.(l)}
                        >
                          <small>
                            {l.start}–{l.end}
                          </small>
                          <strong>
                            {fullName(users.find((u) => u.id === l.studentId))}
                          </strong>
                          <span>{l.title}</span>
                        </button>
                      )
                    },
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div
        className={`calendar__agenda${view === 'agenda' ? ' is-visible' : ''}`}
      >
        {weekLessons.length ? (
          weekLessons.map((l) => (
            <button
              disabled={!onSelect}
              className="agenda-row"
              key={l.id}
              onClick={() => onSelect?.(l)}
            >
              <span>
                {new Date(l.date + 'T12:00').toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'short',
                  weekday: 'short',
                })}
                <strong>
                  {l.start}–{l.end}
                </strong>
              </span>
              <span>
                <strong>
                  {fullName(users.find((u) => u.id === l.studentId))}
                </strong>
                {l.title}
              </span>
              <ChevronRight size={18} />
            </button>
          ))
        ) : (
          <div className="empty-state">
            На этой неделе пока нет занятий.
            {onNew && (
              <button className="text-button" onClick={() => onNew()}>
                Запланировать первое
              </button>
            )}
          </div>
        )}
      </div>
      {!weekLessons.length && (
        <p className="calendar__empty">
          Свободная неделя — время для новых планов.
        </p>
      )}
    </section>
  )
}
