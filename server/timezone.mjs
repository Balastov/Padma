// Student time zone: progress days and streaks are counted by the student's
// own calendar. Lessons and homework deadlines stay on Moscow time.

export const DEFAULT_TIME_ZONE = 'Europe/Moscow'

const formatters = new Map()
function dayFormatter(timeZone) {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    formatters.set(timeZone, f)
  }
  return f
}

/** IANA zone name accepted by Intl, e.g. "Asia/Yekaterinburg". */
export function isTimeZone(value) {
  if (
    typeof value !== 'string' ||
    value.length > 64 ||
    !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(value)
  )
    return false
  try {
    dayFormatter(value)
    return true
  } catch {
    return false
  }
}

/** Calendar day (YYYY-MM-DD) of a moment in the given zone. */
export const localDay = (date, timeZone = DEFAULT_TIME_ZONE) =>
  dayFormatter(isTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE).format(
    date,
  )

/** Day key shifted by whole days, calendar-safe (no DST issues). */
export function addDays(day, delta) {
  const d = new Date(day + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}
