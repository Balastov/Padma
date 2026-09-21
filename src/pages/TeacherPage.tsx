import { useCallback, useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Home,
  Plus,
  Settings,
  Users,
  Video,
  BookOpen,
} from 'lucide-react'
import {
  api,
  moscowToday,
  lessonIsUpcoming,
  dateKey,
  friendlyDate,
  fullName,
  LESSON_URL,
} from '../api'
import type { Lesson, User } from '../api'
import Logo from '../components/Logo'
import Homework from '../components/Homework'
import Modal from '../components/Modal'
import ProfileMenu from '../components/ProfileMenu'
import Avatar from '../components/Avatar'
import Calendar from '../components/Calendar'
import Messages from '../components/Messages'
import UsersPage from './UsersPage'
import EventPage from './EventPage'
import '../styles/workspace.css'

type Props = {
  user: User
  onLogout: () => Promise<void>
  onUserChange: (user: User) => void
}
export default function TeacherPage({ user, onLogout, onUserChange }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [selected, setSelected] = useState<Lesson | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const refresh = useCallback(async () => {
    try {
      const [u, l] = await Promise.all([
        api<User[]>('/users'),
        api<Lesson[]>('/lessons'),
      ])
      setUsers(u)
      setLessons(l)
      setError('')
      setReady(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => {
    let active = true
    Promise.all([api<User[]>('/users'), api<Lesson[]>('/lessons')])
      .then(([u, l]) => {
        if (active) {
          setUsers(u)
          setLessons(l)
          setReady(true)
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [])
  const students = users.filter((u) => u.roles.includes('student'))
  const now = moscowToday(),
    today = dateKey(now)
  const todayCount = lessons.filter((l) => l.date === today).length
  const lessonWord =
    todayCount % 10 === 1 && todayCount % 100 !== 11
      ? 'занятие'
      : todayCount % 10 >= 2 &&
          todayCount % 10 <= 4 &&
          (todayCount % 100 < 12 || todayCount % 100 > 14)
        ? 'занятия'
        : 'занятий'
  const next = lessons.find((l) => lessonIsUpcoming(l))
  const nextStudent = users.find((u) => u.id === next?.studentId)
  const create = (date?: string) =>
    navigate('/teacher/new' + (date ? '?date=' + date : ''))
  async function remove() {
    if (!selected) return
    setBusy(true)
    try {
      await api('/lessons/' + selected.id, 'DELETE', {})
      setSelected(null)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="workspace">
      <aside className="sidebar glass-panel">
        <Logo />
        <nav aria-label="Основное меню">
          <NavLink to="/teacher" end aria-label="Сегодня" title="Сегодня">
            <Home size={23} />
            <span>Сегодня</span>
          </NavLink>
          <NavLink to="/teacher/students" aria-label="Ученики" title="Ученики">
            <Users size={23} />
            <span>Ученики</span>
          </NavLink>
          <NavLink
            to="/teacher/homework"
            aria-label="Домашние задания"
            title="Домашние задания"
          >
            <BookOpen size={23} />
            <span>Домашние задания</span>
          </NavLink>
          <NavLink
            to="/teacher/settings"
            aria-label="Настройки"
            title="Настройки"
          >
            <Settings size={23} />
            <span>Настройки</span>
          </NavLink>
        </nav>
        <div className="sidebar__bottom">
          <span>
            Маленькие шаги.
            <br />
            Большие открытия.
          </span>
          <small>Ваше пространство Padma</small>
        </div>
      </aside>
      <main className="workspace__main">
        <div className="workspace__account">
          <span className="workspace__eyebrow">ПРОСТРАНСТВО ПРЕПОДАВАТЕЛЯ</span>
          <ProfileMenu user={user} onLogout={onLogout} />
        </div>
        {error && (
          <div className="error" role="alert">
            {error}{' '}
            <button className="text-button" onClick={refresh}>
              Повторить загрузку
            </button>
          </div>
        )}
        {!ready ? (
          <p role="status">Загружаем расписание…</p>
        ) : (
          <Routes>
            <Route
              index
              element={
                <>
                  <header className="page-heading">
                    <div>
                      <h1>Сегодня</h1>
                      <p>
                        {now.toLocaleDateString('ru-RU', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <span className="subtle-badge">
                      <CalendarDays size={16} />
                      {todayCount} {lessonWord} сегодня
                    </span>
                  </header>
                  <div className="teacher-overview">
                    <section className="next-teacher glass-panel">
                      <div className="section-heading">
                        <h2>Ближайший урок</h2>
                        {next && (
                          <span className="subtle-badge">Запланирован</span>
                        )}
                      </div>
                      {next ? (
                        <>
                          <div className="next-teacher__student">
                            <Avatar user={nextStudent} large />
                            <div>
                              <h3>{fullName(nextStudent)}</h3>
                              <p>{next.title}</p>
                            </div>
                          </div>
                          <div className="lesson-meta">
                            <span>
                              <CalendarDays size={19} />
                              {friendlyDate(next.date)}
                            </span>
                            <span>
                              <Clock3 size={19} />
                              {next.start} – {next.end}
                            </span>
                          </div>
                          <a
                            className="button-primary next-teacher__cta"
                            href={LESSON_URL}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Video size={21} />
                            Войти в урок
                            <ChevronRight size={20} />
                          </a>
                        </>
                      ) : (
                        <div className="next-teacher__empty">
                          <div className="soft-icon">
                            <BookOpen size={32} />
                          </div>
                          <h3>Здесь начнётся следующий урок</h3>
                          <p>Добавьте ученика и выберите удобное время.</p>
                          <button
                            className="button-primary"
                            onClick={() =>
                              students.length
                                ? create()
                                : navigate('/teacher/students')
                            }
                          >
                            <Plus size={20} />
                            {students.length
                              ? 'Запланировать занятие'
                              : 'Добавить ученика'}
                          </button>
                        </div>
                      )}
                    </section>
                    <Messages
                      user={user}
                      students={students.filter((s) => !!s.teacherId)}
                    />
                  </div>
                  <Calendar
                    lessons={lessons}
                    users={users}
                    onNew={create}
                    onSelect={setSelected}
                  />
                </>
              }
            />
            <Route path="homework" element={<Homework students={students} />} />
            <Route
              path="students"
              element={
                <UsersPage user={user} users={users} refresh={refresh} />
              }
            />
            <Route
              path="new"
              element={
                <EventPage
                  users={users}
                  lessons={lessons}
                  onSaved={async () => {
                    await refresh()
                    navigate('/teacher')
                  }}
                />
              }
            />
            <Route
              path="settings"
              element={
                <UsersPage
                  user={user}
                  users={users}
                  refresh={refresh}
                  profile
                  onUserChange={onUserChange}
                />
              }
            />
            <Route path="*" element={<Navigate to="/teacher" replace />} />
          </Routes>
        )}
        {selected && (
          <Modal titleId="lesson-title" onClose={() => setSelected(null)}>
            <p className="eyebrow">ЗАНЯТИЕ</p>
            <h2 id="lesson-title">{selected.title}</h2>
            <p>{fullName(users.find((u) => u.id === selected.studentId))}</p>
            <p>
              {friendlyDate(selected.date)} · {selected.start}–{selected.end}
            </p>
            {selected.note && <p className="notice">{selected.note}</p>}
            <p className="secondary">
              Отмена удалит только это занятие, остальные повторы сохранятся.
            </p>
            <div className="form-actions">
              <button
                className="button-secondary"
                autoFocus
                onClick={() => setSelected(null)}
              >
                Закрыть
              </button>
              <button
                className="button-danger"
                disabled={busy}
                onClick={remove}
              >
                {busy ? 'Отменяем…' : 'Отменить занятие'}
              </button>
            </div>
          </Modal>
        )}
      </main>
    </div>
  )
}
