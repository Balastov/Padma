import type { StoredFile } from './files'

export type Role = 'owner' | 'admin' | 'teacher' | 'student' | 'guest'
export type User = {
  id: string
  name: string
  surname: string
  email: string
  phone?: string
  roles: Role[]
  teacherId: string | null
  photo: string
  notificationsEnabled?: boolean
  /** IANA zone for progress days, Europe/Moscow by default. */
  timeZone?: string
}
export type Teacher = Pick<User, 'id' | 'name' | 'surname' | 'photo'>
export type LessonStatus = 'scheduled' | 'cancelled' | 'noshow'
export type Lesson = {
  id: string
  studentId: string
  teacherId: string
  date: string
  start: string
  end: string
  title: string
  note: string
  seriesId: string | null
  status: LessonStatus
  /** Number of the lesson in its series, 0 for cancelled and no-show. */
  seq: number
  /** Title set by hand instead of the series plan. */
  customTitle: boolean
}
export const lessonStatusNames: Record<LessonStatus, string> = {
  scheduled: 'Запланирован',
  cancelled: 'Отменён',
  noshow: 'Неявка',
}
/** Lesson title, prefixed with the status for cancelled and no-show. */
export const lessonCaption = (lesson: Lesson) =>
  (lesson.status === 'scheduled'
    ? ''
    : lessonStatusNames[lesson.status] + ' · ') + lesson.title
/** Weekday 1 (Monday) … 7 (Sunday) with its own time. */
export type SeriesDay = { weekday: number; start: string; end: string }
export type Recurrence = {
  everyWeeks: number
  days: SeriesDay[]
  endType: 'never' | 'until' | 'count'
  until: string | null
  count: number | null
  /** Lesson topics in order; when it runs out the series title is used. */
  plan: string[]
}
export type LessonSeries = Recurrence & {
  id: string
  studentId: string
  teacherId: string
  startDate: string
  title: string
  note: string
}
export type LessonConflict = {
  date: string
  start: string
  end: string
  busyStart: string
  busyEnd: string
}
export type Message = {
  id: string
  studentId: string
  senderId: string
  text: string
  created: string
  files?: StoredFile[]
}
export type LibraryItem = {
  id: string
  authorId: string
  title: string
  description: string
  /** "all": every student of the author (whole school for an admin). */
  audience: 'all' | 'selected'
  created: string
  file: StoredFile | null
  /** Only for those who manage the material. */
  studentIds?: string[]
}
export const roleNames: Record<Role, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  teacher: 'Учитель',
  student: 'Ученик',
  guest: 'Гость',
}
export const isManager = (user: User) =>
  user.roles.some((r) => r === 'owner' || r === 'admin')
export const isStaff = (user: User) =>
  isManager(user) || user.roles.includes('teacher')
export const LESSON_URL = 'https://s03fa3hb.ktalk.ru/lesngcokej1n'
export class ApiError extends Error {
  status: number
  conflicts: LessonConflict[]
  constructor(message: string, status: number, conflicts?: LessonConflict[]) {
    super(message)
    this.status = status
    this.conflicts = conflicts || []
  }
}
export async function api<T>(
  path: string,
  method = 'GET',
  data?: unknown,
): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  let result: { error?: string; conflicts?: LessonConflict[] } = {}
  try {
    result = await res.json()
  } catch {
    result = {}
  }
  if (res.status === 401 && path !== '/me' && path !== '/login')
    window.location.assign('/')
  if (!res.ok)
    throw new ApiError(
      result.error || 'Не удалось выполнить запрос',
      res.status,
      result.conflicts,
    )
  return result as T
}
export const fullName = (user?: Pick<User, 'name' | 'surname'> | null) =>
  user ? `${user.name} ${user.surname}`.trim() : 'Пользователь'
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function weekDays(date: Date) {
  const monday = new Date(date)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return d
  })
}
export const friendlyDate = (value: string) =>
  new Date(value + 'T12:00:00').toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  })

export const TIME_ZONE = 'Europe/Moscow'
export function moscowToday() {
  return new Date(
    new Date()
      .toLocaleString('sv-SE', { timeZone: TIME_ZONE })
      .replace(' ', 'T'),
  )
}
export const lessonIsUpcoming = (lesson: Lesson) =>
  (lesson.status ?? 'scheduled') === 'scheduled' &&
  new Date(lesson.date + 'T' + lesson.end + ':00+03:00').getTime() > Date.now()
