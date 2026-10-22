// Time zones offered in the profile. Progress days and streaks follow the
// student's zone; lessons stay on Moscow time.

export const DEFAULT_TIME_ZONE = 'Europe/Moscow'

const ZONES: [string, string][] = [
  ['Europe/Kaliningrad', 'Калининград'],
  ['Europe/Moscow', 'Москва'],
  ['Europe/Samara', 'Самара'],
  ['Asia/Yekaterinburg', 'Екатеринбург'],
  ['Asia/Omsk', 'Омск'],
  ['Asia/Novosibirsk', 'Новосибирск'],
  ['Asia/Krasnoyarsk', 'Красноярск'],
  ['Asia/Irkutsk', 'Иркутск'],
  ['Asia/Yakutsk', 'Якутск'],
  ['Asia/Vladivostok', 'Владивосток'],
  ['Asia/Magadan', 'Магадан'],
  ['Asia/Kamchatka', 'Петропавловск-Камчатский'],
  ['Europe/Minsk', 'Минск'],
  ['Europe/Kyiv', 'Киев'],
  ['Europe/Istanbul', 'Стамбул'],
  ['Asia/Tbilisi', 'Тбилиси'],
  ['Asia/Yerevan', 'Ереван'],
  ['Asia/Baku', 'Баку'],
  ['Asia/Dubai', 'Дубай'],
  ['Asia/Tashkent', 'Ташкент'],
  ['Asia/Almaty', 'Алматы'],
  ['Asia/Bishkek', 'Бишкек'],
  ['Asia/Bangkok', 'Бангкок'],
  ['Asia/Makassar', 'Бали'],
  ['Europe/London', 'Лондон'],
  ['Europe/Lisbon', 'Лиссабон'],
  ['Europe/Berlin', 'Берлин'],
  ['Europe/Paris', 'Париж'],
  ['Europe/Belgrade', 'Белград'],
  ['Asia/Jerusalem', 'Иерусалим'],
  ['America/New_York', 'Нью-Йорк'],
  ['America/Los_Angeles', 'Лос-Анджелес'],
]

function offset(timeZone: string) {
  try {
    const part = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value
    return part ? part.replace('GMT', 'UTC') : ''
  } catch {
    return ''
  }
}

/** Zones for a select, keeping an unlisted current value selectable. */
export function timeZoneOptions(current = DEFAULT_TIME_ZONE) {
  const list = ZONES.some(([id]) => id === current)
    ? ZONES
    : [...ZONES, [current, current] as [string, string]]
  return list.map(([id, city]) => {
    const utc = offset(id)
    return { id, label: utc ? `${city} (${utc === 'UTC' ? 'UTC+0' : utc})` : city }
  })
}

export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}
