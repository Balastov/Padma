import type { Recurrence } from '../api'
import { WEEKDAYS, addDays, everyLabel } from '../lessonSeries'
import './RecurrenceFields.css'

type Props = {
  value: Recurrence
  onChange: (value: Recurrence) => void
  /** First lesson date: the default for «до даты». */
  startDate: string
}
export default function RecurrenceFields({
  value,
  onChange,
  startDate,
}: Props) {
  const set = (patch: Partial<Recurrence>) => onChange({ ...value, ...patch })
  function toggleDay(weekday: number) {
    const on = value.days.some((d) => d.weekday === weekday)
    if (on && value.days.length === 1) return
    const template = value.days[0] || { start: '14:00', end: '14:50' }
    set({
      days: on
        ? value.days.filter((d) => d.weekday !== weekday)
        : [
            ...value.days,
            { weekday, start: template.start, end: template.end },
          ].sort((a, b) => a.weekday - b.weekday),
    })
  }
  const setTime = (weekday: number, key: 'start' | 'end', time: string) =>
    set({
      days: value.days.map((d) =>
        d.weekday === weekday ? { ...d, [key]: time } : d,
      ),
    })
  return (
    <div className="recurrence">
      <label className="field">
        <span>Повторять</span>
        <select
          value={value.everyWeeks}
          onChange={(e) => set({ everyWeeks: Number(e.target.value) })}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {everyLabel(n).toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="recurrence__group">
        <legend>Дни и время *</legend>
        <div className="recurrence__days">
          {WEEKDAYS.map((name, i) => {
            const on = value.days.some((d) => d.weekday === i + 1)
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                className={on ? 'is-on' : ''}
                onClick={() => toggleDay(i + 1)}
              >
                {name}
              </button>
            )
          })}
        </div>
        {value.days.map((d) => (
          <div className="recurrence__time" key={d.weekday}>
            <strong>{WEEKDAYS[d.weekday - 1]}</strong>
            <input
              required
              type="time"
              aria-label={`${WEEKDAYS[d.weekday - 1]}: начало`}
              value={d.start}
              onChange={(e) => setTime(d.weekday, 'start', e.target.value)}
            />
            <span aria-hidden="true">–</span>
            <input
              required
              type="time"
              aria-label={`${WEEKDAYS[d.weekday - 1]}: окончание`}
              value={d.end}
              onChange={(e) => setTime(d.weekday, 'end', e.target.value)}
            />
          </div>
        ))}
      </fieldset>
      <fieldset className="recurrence__group">
        <legend>Окончание</legend>
        <div className="segmented recurrence__segmented">
          {(
            [
              ['never', 'Бессрочно'],
              ['until', 'До даты'],
              ['count', 'Число уроков'],
            ] as const
          ).map(([type, label]) => (
            <button
              key={type}
              type="button"
              aria-pressed={value.endType === type}
              className={value.endType === type ? 'active' : ''}
              onClick={() =>
                set({
                  endType: type,
                  until: value.until || addDays(startDate, 90),
                  count: value.count || 8,
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
        {value.endType === 'never' && (
          <small className="caption">
            Уроки создаются на 16 недель вперёд и продлеваются автоматически.
          </small>
        )}
        {value.endType === 'until' && (
          <label className="field">
            <span>Последний день серии</span>
            <input
              required
              type="date"
              min={startDate}
              value={value.until || ''}
              onChange={(e) => set({ until: e.target.value })}
            />
          </label>
        )}
        {value.endType === 'count' && (
          <label className="field">
            <span>Количество уроков</span>
            <input
              required
              type="number"
              min={1}
              max={200}
              value={value.count || ''}
              onChange={(e) => set({ count: Number(e.target.value) })}
            />
            <small>
              Отменённые и удалённые уроки переносятся в конец серии, неявка
              засчитывается.
            </small>
          </label>
        )}
      </fieldset>
      <label className="field">
        <span>
          План тем <small>по одной на строку, необязательно</small>
        </span>
        <textarea
          rows={5}
          placeholder={'Present Simple\nPast Simple\nTravel vocabulary'}
          value={value.plan.join('\n')}
          onChange={(e) => set({ plan: e.target.value.split('\n') })}
        />
        <small>
          Темы идут по урокам по порядку. Отмена, неявка или удаление урока
          сдвигают темы на следующие уроки. Когда план закончится, берётся тема
          урока.
        </small>
      </label>
    </div>
  )
}
