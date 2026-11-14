import { friendlyDate } from './api'
import type { Recurrence } from './api'

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
/** «по понедельникам» … */
const ON_WEEKDAYS = [
  'понедельникам',
  'вторникам',
  'средам',
  'четвергам',
  'пятницам',
  'субботам',
  'воскресеньям',
]

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

/**
 * What «этот и следующие» does to a series lesson moved to date/start/end:
 * from this lesson on, its weekday of the rule takes the new weekday and time.
 */
export function moveFollowingHint(
  rule: Recurrence,
  occurrence: string,
  { date, start, end }: { date: string; start: string; end: string },
) {
  // Nothing to explain while the date is being typed.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) return null
  const from = occurrence.slice(0, 10)
  const weekday = isoWeekday(from),
    target = isoWeekday(date)
  if (!rule.days.some((d) => d.weekday === weekday))
    return {
      ok: true,
      text: 'Этого дня недели нет в правиле серии: перенесётся только этот урок.',
    }
  if (target !== weekday && rule.days.some((d) => d.weekday === target))
    return {
      ok: false,
      text: `По ${ON_WEEKDAYS[target - 1]} в серии уже есть уроки. Перенесите только этот урок или измените серию.`,
    }
  const place = target === weekday ? '' : ` по ${ON_WEEKDAYS[target - 1]}`
  let text = `С этого урока уроки по ${ON_WEEKDAYS[weekday - 1]} пойдут${place} в ${start}–${end}.`
  if (rule.days.length > 1) text += ' Остальные дни серии не изменятся.'
  if (addDays(date, -7) >= from)
    text += ` Уроки по ${ON_WEEKDAYS[target - 1]} до ${friendlyDate(date)} уберутся из расписания.`
  return { ok: true, text }
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
