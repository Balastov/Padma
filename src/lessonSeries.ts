import { friendlyDate } from './api'
import type { Recurrence } from './api'

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/** ISO weekday of a YYYY-MM-DD key: 1 Monday … 7 Sunday. */
export const isoWeekday = (date: string) =>
  new Date(date + 'T12:00:00Z').getUTCDay() || 7

export function addDays(date: string, days: number) {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const everyLabel = (weeks: number) =>
  weeks === 1
    ? 'Каждую неделю'
    : `Раз в ${weeks} ${weeks < 5 ? 'недели' : 'недель'}`

export function lessonsWord(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return 'урок'
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14))
    return 'урока'
  return 'уроков'
}

export function describeRule(rule: Recurrence) {
  const days = rule.days
    .map((d) => `${WEEKDAYS[d.weekday - 1]} ${d.start}–${d.end}`)
    .join(', ')
  const end =
    rule.endType === 'never'
      ? 'бессрочно'
      : rule.endType === 'until'
        ? `до ${friendlyDate(rule.until || '')}`
        : `${rule.count} ${lessonsWord(rule.count || 0)}`
  return `${everyLabel(rule.everyWeeks)}: ${days} · ${end}`
}

export const newRecurrence = (
  date: string,
  start: string,
  end: string,
): Recurrence => ({
  everyWeeks: 1,
  days: [{ weekday: isoWeekday(date), start, end }],
  endType: 'never',
  until: null,
  count: 8,
  plan: [],
})
