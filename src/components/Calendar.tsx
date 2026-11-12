import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { layoutDay } from '../calendarLayout'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import {
  moscowToday,
  dateKey,
  fullName,
  lessonCaption,
  lessonState,
  lessonStateNames,
  weekDays,
} from '../api'
import type { Lesson, User } from '../api'
/** New place of a lesson dragged in the week grid. */
export type LessonSlot = { date: string; start: string; end: string }
type Props = {
  lessons: Lesson[]
  users: User[]
  onNew?: (date?: string) => void
  onSelect?: (lesson: Lesson) => void
  /** Enables moving scheduled lessons by drag and drop. */
  onMove?: (lesson: Lesson, slot: LessonSlot) => void
  compact?: boolean
}
const HOUR = 52,
  SNAP = 15,
  LONG_PRESS = 350
const toMinutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
export default function Calendar({
  lessons,
  users,
  onNew,
  onSelect,
  onMove,
  compact,
}: Props) {
  const [anchor, setAnchor] = useState(moscowToday)
  const [view, setView] = useState('week')
  const [drag, setDrag] = useState<{
    lesson: Lesson
    target: LessonSlot
  } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const stopDrag = useRef<(() => void) | null>(null)
  const suppressClick = useRef(false)
  useEffect(() => () => stopDrag.current?.(), [])
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
    ...weekLessons.map((l) => Math.ceil(toMinutes(l.end) / 60)),
  )
  const hours = Array.from(
    { length: latest - earliest },
    (_, i) => earliest + i,
  )
  const studentName = (l: Lesson) =>
    fullName(users.find((u) => u.id === l.studentId))

  // Mouse drags after a few pixels; touch needs a long press so the
  // grid still scrolls under a finger.
  function startDrag(e: ReactPointerEvent<HTMLButtonElement>, lesson: Lesson) {
    suppressClick.current = false
    if (!onMove || lesson.status !== 'scheduled' || e.button !== 0) return
    stopDrag.current?.()
    const column = e.currentTarget.parentElement
    if (!column) return
    const move = onMove,
      pointerId = e.pointerId,
      touch = e.pointerType === 'touch',
      x0 = e.clientX,
      y0 = e.clientY,
      startMin = toMinutes(lesson.start),
      duration = toMinutes(lesson.end) - startMin,
      grab =
        earliest * 60 +
        ((y0 - column.getBoundingClientRect().top) / HOUR) * 60 -
        startMin
    let active = false,
      target: LessonSlot = {
        date: lesson.date,
        start: lesson.start,
        end: lesson.end,
      }
    const slotAt = (x: number, y: number) => {
      const columns = [
        ...(gridRef.current?.querySelectorAll<HTMLElement>(
          '.calendar__slots[data-date]',
        ) ?? []),
      ]
      if (!columns.length) return target
      const col =
        columns.find((c) => {
          const r = c.getBoundingClientRect()
          return x >= r.left && x < r.right
        }) ??
        (x < columns[0].getBoundingClientRect().left
          ? columns[0]
          : columns[columns.length - 1])
      const raw =
        earliest * 60 +
        ((y - col.getBoundingClientRect().top) / HOUR) * 60 -
        grab
      const start = Math.min(
        Math.max(Math.round(raw / SNAP) * SNAP, earliest * 60),
        latest * 60 - duration,
      )
      return {
        date: col.dataset.date ?? lesson.date,
        start: toTime(start),
        end: toTime(start + duration),
      }
    }
    const activate = () => {
      active = true
      suppressClick.current = true
      setDrag({ lesson, target })
    }
    const timer = touch ? window.setTimeout(activate, LONG_PRESS) : 0
    const finish = () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('touchmove', blockScroll)
      window.removeEventListener('keydown', onKey)
      stopDrag.current = null
      setDrag(null)
    }
    function onPointerMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      if (!active) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < (touch ? 10 : 4))
          return
        // A finger that moves before the long press scrolls the page.
        if (touch) return finish()
        activate()
      }
      const next = slotAt(ev.clientX, ev.clientY)
      if (next.date !== target.date || next.start !== target.start) {
        target = next
        setDrag({ lesson, target })
      }
    }
    function onPointerUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      const moved =
        active && (target.date !== lesson.date || target.start !== lesson.start)
      finish()
      // The click that follows a drop must not open the lesson.
      window.setTimeout(() => {
        suppressClick.current = false
      })
      if (moved) move(lesson, target)
    }
    function blockScroll(ev: TouchEvent) {
      if (active) ev.preventDefault()
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') finish()
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('touchmove', blockScroll, { passive: false })
    window.addEventListener('keydown', onKey)
    stopDrag.current = finish
  }
  return (
    <section
      className={`calendar glass-panel${compact ? ' calendar--compact' : ''}${drag ? ' is-dragging' : ''}`}
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
          ref={gridRef}
          className="calendar__grid"
          style={{ minHeight: hours.length * HOUR + 58 }}
        >
          <div className="calendar__times">
            <div className="calendar__day-head" />
            {hours.map((h) => (
              <span key={h}>{String(h).padStart(2, '0')}:00</span>
            ))}
          </div>
          {days.map((day) => {
            const key = dateKey(day)
            const ghost = drag?.target.date === key ? drag : null
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
                  data-date={key}
                  style={{ height: hours.length * HOUR }}
                >
                  {hours.map((h) => (
                    <div className="calendar__slot" key={h} />
                  ))}
                  {layoutDay(weekLessons.filter((l) => l.date === key)).map(
                    ({ lesson: l, lane, lanes }) => {
                      const start = toMinutes(l.start),
                        end = toMinutes(l.end),
                        state = lessonState(l),
                        draggable = Boolean(onMove) && l.status === 'scheduled'
                      return (
                        <button
                          key={l.id}
                          title={`${studentName(l)} · ${l.start}–${l.end} · ${lessonStateNames[state]} · ${l.title}${draggable ? ' · перетащите, чтобы перенести' : ''}`}
                          disabled={!onSelect}
                          className={`calendar__event state-${state} is-${l.status}${draggable ? ' is-draggable' : ''}${drag?.lesson.id === l.id ? ' is-drag-source' : ''}`}
                          style={{
                            left: `calc(${(lane / lanes) * 100}% + 3px)`,
                            width: `calc(${100 / lanes}% - 6px)`,
                            top: (start / 60 - earliest) * HOUR,
                            height: Math.max(
                              ((end - start) / 60) * HOUR - 3,
                              24,
                            ),
                          }}
                          onPointerDown={(e) => startDrag(e, l)}
                          onClick={() => {
                            if (!suppressClick.current) onSelect?.(l)
                          }}
                        >
                          <small>
                            {l.start}–{l.end}
                          </small>
                          <strong>{studentName(l)}</strong>
                          <span>{lessonCaption(l)}</span>
                        </button>
                      )
                    },
                  )}
                  {ghost && (
                    <div
                      className={`calendar__event calendar__ghost state-${lessonState({ ...ghost.lesson, ...ghost.target })}`}
                      aria-hidden="true"
                      style={{
                        top:
                          (toMinutes(ghost.target.start) / 60 - earliest) *
                          HOUR,
                        height: Math.max(
                          ((toMinutes(ghost.target.end) -
                            toMinutes(ghost.target.start)) /
                            60) *
                            HOUR -
                            3,
                          24,
                        ),
                      }}
                    >
                      <small>
                        {ghost.target.start}–{ghost.target.end}
                      </small>
                      <strong>{studentName(ghost.lesson)}</strong>
                    </div>
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
              className={`agenda-row state-${lessonState(l)} is-${l.status}`}
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
                  <i
                    className="lesson-state-dot"
                    title={lessonStateNames[lessonState(l)]}
                  />
                  {studentName(l)}
                </strong>
                {lessonCaption(l)}
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
      {weekLessons.length > 0 && (
        <ul className="calendar__legend" aria-label="Цвета занятий">
          {(['scheduled', 'done', 'noshow', 'cancelled'] as const).map((s) => (
            <li key={s} className={`state-${s}`}>
              <i className="lesson-state-dot" />
              {lessonStateNames[s]}
            </li>
          ))}
        </ul>
      )}
      {!weekLessons.length && (
        <p className="calendar__empty">
          Свободная неделя — время для новых планов.
        </p>
      )}
    </section>
  )
}
