import { useCallback, useEffect, useState } from 'react'
import {
  CalendarDays,
  Clock3,
  ChevronLeft,
  ChevronRight,
  UserRound,
  Video,
} from 'lucide-react'
import {
  api,
  moscowToday,
  lessonIsUpcoming,
  dateKey,
  friendlyDate,
  fullName,
  LESSON_URL,
  weekDays,
} from '../api'
import type { Lesson, Teacher, User } from '../api'
import Logo from '../components/Logo'
import Avatar from '../components/Avatar'
import ProfileMenu from '../components/ProfileMenu'
import Messages from '../components/Messages'
import Homework from '../components/Homework'
import './DashboardPage.css'
export default function DashboardPage({
  user,
  onLogout,
}: {
  user: User
  onLogout: () => Promise<void>
}) {
  const [lessons, setLessons] = useState<Lesson[]>([]),
    [teacher, setTeacher] = useState<Teacher | null>(null),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(false)
  const [anchor, setAnchor] = useState(moscowToday),
    [selectedDay, setSelectedDay] = useState('')
  const load = useCallback(async () => {
    try {
      const [l, t] = await Promise.all([
        api<Lesson[]>('/lessons'),
        api<Teacher[]>('/teachers'),
      ])
      setLessons(l)
      setTeacher(t.find((v) => v.id === user.teacherId) || null)
      setError('')
      setLoaded(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [user.teacherId])
  useEffect(() => {
    let active = true
    Promise.all([api<Lesson[]>('/lessons'), api<Teacher[]>('/teachers')])
      .then(([l, t]) => {
        if (active) {
          setLessons(l)
          setTeacher(t.find((v) => v.id === user.teacherId) || null)
          setLoaded(true)
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [user.teacherId])
  const days = weekDays(anchor),
    next = lessons.find((l) => lessonIsUpcoming(l))
  const visible = lessons.filter(
    (l) =>
      l.date >= dateKey(days[0]) &&
      l.date <= dateKey(days[6]) &&
      (!selectedDay || l.date === selectedDay),
  )
  const shift = (n: number) => {
    const d = new Date(anchor)
    d.setDate(d.getDate() + n * 7)
    setAnchor(d)
    setSelectedDay('')
  }
  return (
    <div className="student-page">
      <header className="student-header">
        <Logo />
        <ProfileMenu user={user} onLogout={onLogout} />
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
          <button onClick={load} className="text-button">
            Повторить
          </button>
        </p>
      )}
      {!loaded && !error && <p role="status">Загружаем ваши уроки…</p>}
      <main className="student-grid">
        <div className="student-main">
          <section className="student-next glass-panel">
            <div className="student-next__portrait">
              {teacher ? (
                <Avatar user={teacher} large />
              ) : (
                <img
                  src="/teacher-placeholder.png"
                  alt="Учитель в белой блузке с планшетом"
                />
              )}
            </div>
            <div className="student-next__content">
              <p className="eyebrow">
                {teacher ? 'СЛЕДУЮЩИЙ УРОК' : 'ВАШЕ ПРОСТРАНСТВО'}
              </p>
              <h1>
                {!teacher
                  ? 'Скоро вам назначат учителя'
                  : next
                    ? next.title
                    : 'Новые встречи впереди'}
              </h1>
              {next ? (
                <div className="lesson-meta">
                  <span>
                    <CalendarDays size={18} />
                    {friendlyDate(next.date)}, {next.start}
                  </span>
                  <span>
                    <Clock3 size={18} />
                    {Number(next.end.slice(0, 2)) * 60 +
                      Number(next.end.slice(3)) -
                      Number(next.start.slice(0, 2)) * 60 -
                      Number(next.start.slice(3))}{' '}
                    минут
                  </span>
                </div>
              ) : (
                <p className="secondary">
                  {teacher
                    ? 'Как только учитель назначит занятие, оно появится здесь.'
                    : 'Уроки и общение появятся здесь после знакомства.'}
                </p>
              )}
              {teacher && (
                <p className="student-next__teacher">
                  <UserRound size={18} />
                  {fullName(teacher)}
                </p>
              )}
              {next && (
                <a
                  className="button-primary"
                  href={LESSON_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Video size={20} />
                  Подключиться к уроку
                  <ChevronRight size={18} />
                </a>
              )}
            </div>
          </section>
          <section className="student-inspiration">
            <div>
              <h2>Keep going — step by step</h2>
              <p>Продолжай идти — шаг за шагом</p>
            </div>
          </section>
          <div className="student-homework">
            <Homework />
          </div>
        </div>
        <aside className="student-aside">
          <section className="student-schedule glass-panel">
            <h2>Расписание на неделю</h2>
            <p className="caption">Москва · UTC+3</p>
            <div className="student-week-nav">
              <button
                className="icon-button"
                aria-label="Предыдущая неделя"
                onClick={() => shift(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                {days[0].getDate()}–
                {days[6].toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                })}
              </span>
              <button
                className="icon-button"
                aria-label="Следующая неделя"
                onClick={() => shift(1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="student-days">
              {days.map((d) => (
                <button
                  key={dateKey(d)}
                  className={selectedDay === dateKey(d) ? 'is-active' : ''}
                  aria-pressed={selectedDay === dateKey(d)}
                  onClick={() =>
                    setSelectedDay(selectedDay === dateKey(d) ? '' : dateKey(d))
                  }
                >
                  <span>
                    {d.toLocaleDateString('ru-RU', { weekday: 'short' })}
                  </span>
                  <strong>{d.getDate()}</strong>
                </button>
              ))}
            </div>
            {visible.length ? (
              visible.map((l) => (
                <div key={l.id} className="student-schedule__lesson">
                  <span className="status-dot" />
                  <div>
                    <strong>
                      {friendlyDate(l.date)}, {l.start}
                    </strong>
                    <small>{l.title}</small>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">
                {selectedDay
                  ? 'В этот день занятий нет.'
                  : 'На этой неделе занятий пока нет.'}
              </p>
            )}
          </section>
          <Messages user={user} teacher={teacher} />
        </aside>
      </main>
    </div>
  )
}
