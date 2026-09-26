import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  Clock3,
  ChevronLeft,
  ChevronRight,
  UserRound,
  Video,
  Volume2,
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
} from '../../api'
import type { Lesson, Teacher, User } from '../../api'
import Avatar from '../../components/Avatar'
import Homework from '../../components/Homework'
import { revisitWords } from '../../student/progressStore'
import { playWordAudio } from '../../student/audio'
import '../DashboardPage.css'
import './TodayPage.css'

export default function TodayPage({ user }: { user: User }) {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [anchor, setAnchor] = useState(moscowToday)
  const [selectedDay, setSelectedDay] = useState('')
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const revisit = revisitWords().slice(0, 5)

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
    void load()
  }, [load])

  const days = weekDays(anchor)
  const next = lessons.find((l) => lessonIsUpcoming(l))
  const todayKey = dateKey(moscowToday())
  const future = lessons.filter((l) => l.date >= todayKey)
  const pastCount = lessons.filter((l) => l.date < todayKey).length
  const visible = future.filter(
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
    <div className="today-page">
      <header className="page-heading">
        <div>
          <h1>Сегодня</h1>
          <p>Ближайшее и то, что важно прямо сейчас.</p>
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}{' '}
          <button type="button" className="text-button" onClick={load}>
            Повторить
          </button>
        </p>
      )}
      {!loaded && !error && <p role="status">Загружаем…</p>}
      <div className="today-grid">
        <div className="today-main">
          <section className="student-next glass-panel">
            <div className="student-next__portrait">
              {teacher ? (
                <Avatar user={teacher} large />
              ) : (
                <img
                  src="/teacher-placeholder.png"
                  alt=""
                />
              )}
            </div>
            <div className="student-next__content">
              <p className="eyebrow">
                {teacher ? 'БЛИЖАЙШИЙ УРОК' : 'ВАШЕ ПРОСТРАНСТВО'}
              </p>
              <h2>
                {!teacher
                  ? 'Скоро вам назначат учителя'
                  : next
                    ? next.title
                    : 'Новые встречи впереди'}
              </h2>
              {next ? (
                <div className="lesson-meta">
                  <span>
                    <CalendarDays size={18} />
                    {friendlyDate(next.date)}, {next.start}
                  </span>
                  <span>
                    <Clock3 size={18} />
                    до {next.end}
                  </span>
                </div>
              ) : (
                <p className="secondary">
                  {teacher
                    ? 'Как только учитель назначит занятие, оно появится здесь.'
                    : 'Уроки появятся после знакомства с учителем.'}
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
                  Подключиться
                  <ChevronRight size={18} />
                </a>
              )}
            </div>
          </section>

          <section className="glass-panel today-prep">
            <h2>Подготовка к уроку</h2>
            <div className="today-prep__cards">
              <div>
                <small>Материал</small>
                <strong>Present Perfect vs Past Simple</strong>
                <Link to="/library/m1">Открыть</Link>
              </div>
              <div>
                <small>Слова</small>
                <strong>Travelling · 20 слов</strong>
                <Link to="/words/dictionary/lessons/vl-12">К словам урока</Link>
              </div>
            </div>
            <div className="student-homework">
              <Homework />
            </div>
          </section>

          {revisit.length > 0 && (
            <section className="glass-panel today-revisit">
              <div className="today-revisit__head">
                <h2>Слова, к которым стоит вернуться</h2>
                <Link
                  className="button-primary button-small"
                  to="/words/trainer?source=revisit"
                >
                  Повторить
                </Link>
              </div>
              <ul>
                {revisit.map((w) => (
                  <li key={w.id}>
                    <div>
                      <strong>{w.word}</strong>
                      <span>{w.transcription}</span>
                      <small>{w.translation}</small>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Произношение"
                      onClick={() => playWordAudio(w.word)}
                    >
                      <Volume2 size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="today-aside">
          <section className="student-schedule glass-panel">
            <h2>Расписание на неделю</h2>
            <p className="caption">Москва · UTC+3 · только будущие</p>
            <div className="student-week-nav">
              <button
                type="button"
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
                type="button"
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
                  type="button"
                  key={dateKey(d)}
                  className={selectedDay === dateKey(d) ? 'is-active' : ''}
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
              <p className="empty-state">На этой неделе будущих занятий нет.</p>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => setScheduleOpen(!scheduleOpen)}
            >
              {scheduleOpen ? 'Скрыть полное расписание' : 'Полное расписание'}
            </button>
            {scheduleOpen &&
              future.map((l) => (
                <div key={l.id} className="student-schedule__lesson">
                  <div>
                    <strong>
                      {friendlyDate(l.date)}, {l.start}
                    </strong>
                    <small>{l.title}</small>
                  </div>
                </div>
              ))}
            {pastCount > 0 && (
              <p className="caption">
                Прошедшие занятия — в{' '}
                <Link to="/lessons">Моих уроках</Link>.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
