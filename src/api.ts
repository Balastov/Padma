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
}
export type Teacher = Pick<User, 'id' | 'name' | 'surname' | 'photo'>
export type Lesson = {
  id: string
  studentId: string
  teacherId: string
  date: string
  start: string
  end: string
  title: string
  note: string
}
export type Message = {
  id: string
  studentId: string
  senderId: string
  text: string
  created: string
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
  constructor(message: string, status: number) {
    super(message)
    this.status = status
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
  const result = await res.json()
  if (res.status === 401 && path !== '/me' && path !== '/login')
    window.location.assign('/')
  if (!res.ok)
    throw new ApiError(
      result.error || 'Не удалось выполнить запрос',
      res.status,
    )
  return result
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
  new Date(lesson.date + 'T' + lesson.end + ':00+03:00').getTime() > Date.now()
