import { dateKey, moscowToday } from './api'
import { addDays } from './lessonSeries'

/** Lesson lengths offered for the end time, in minutes. */
export const DURATIONS = [15, 30, 60, 90, 120]
export const DEFAULT_DURATION = 60
const LAST_MINUTE = 23 * 60 + 59

export const isTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
export const toMinutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
const pad = (n: number) => String(n).padStart(2, '0')
export const fromMinutes = (total: number) =>
  `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
/** A lesson ends the same day: later times stop at 23:59. */
export const plusMinutes = (time: string, length: number) =>
  fromMinutes(Math.min(toMinutes(time) + length, LAST_MINUTE))
export const fitsDay = (time: string, length: number) =>
  toMinutes(time) + length <= LAST_MINUTE

export function durationLabel(length: number) {
  const hours = Math.floor(length / 60),
    rest = length % 60
  return [hours ? `${hours} ч` : '', rest ? `${rest} мин` : '']
    .filter(Boolean)
    .join(' ')
}

/** A new start keeps the lesson's length (an hour if it had none). */
export function withStart(start: string, end: string, next: string) {
  if (!isTime(next)) return { start: next, end }
  const length =
    isTime(start) && isTime(end) ? toMinutes(end) - toMinutes(start) : 0
  return {
    start: next,
    end: plusMinutes(next, length > 0 ? length : DEFAULT_DURATION),
  }
}

/** Suggested lesson: now in Moscow, rounded up to 15 minutes, for an hour. */
export function suggestedLesson(date?: string | null) {
  const now = moscowToday()
  let day = dateKey(now)
  let start = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15
  if (start >= 24 * 60) {
    day = addDays(day, 1)
    start = 0
  }
  const time = fromMinutes(start)
  return {
    date: date || day,
    start: time,
    end: plusMinutes(time, DEFAULT_DURATION),
  }
}
