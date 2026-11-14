import { useId, useState } from 'react'
import {
  DURATIONS,
  durationLabel,
  fitsDay,
  isTime,
  plusMinutes,
  toMinutes,
  withStart,
} from '../lessonTime'
import './LessonTimeFields.css'

type Times = { start: string; end: string }

/** Lesson end: a length from the start or any time («Произвольно»). */
export function EndTimeSelect({
  start,
  end,
  onChange,
  label,
}: {
  start: string
  end: string
  onChange: (end: string) => void
  /** Accessible name of the select and the time input. */
  label: string
}) {
  const valid = isTime(start)
  const length = valid && isTime(end) ? toMinutes(end) - toMinutes(start) : 0
  const preset = DURATIONS.includes(length)
  const [custom, setCustom] = useState(!preset)
  const showTime = custom || !preset || !valid
  return (
    <div className="end-time">
      {valid && (
        <select
          aria-label={label}
          value={showTime ? 'custom' : String(length)}
          onChange={(e) => {
            if (e.target.value === 'custom') return setCustom(true)
            setCustom(false)
            onChange(plusMinutes(start, Number(e.target.value)))
          }}
        >
          {DURATIONS.filter((d) => fitsDay(start, d)).map((d) => (
            <option key={d} value={d}>
              {plusMinutes(start, d)} · {durationLabel(d)}
            </option>
          ))}
          <option value="custom">Произвольно</option>
        </select>
      )}
      {showTime && (
        <input
          required
          type="time"
          aria-label={`${label}: время`}
          value={end}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

/** Start and end of a lesson: changing the start keeps the length. */
export default function LessonTimeFields({
  start,
  end,
  onChange,
}: Times & { onChange: (times: Times) => void }) {
  const endId = useId()
  return (
    <div className="form-two lesson-time">
      <label className="field">
        <span>Начало *</span>
        <input
          required
          type="time"
          value={start}
          onChange={(e) => onChange(withStart(start, end, e.target.value))}
        />
      </label>
      <div className="field" role="group" aria-labelledby={endId}>
        <span id={endId}>Окончание *</span>
        <EndTimeSelect
          start={start}
          end={end}
          label="Окончание"
          onChange={(value) => onChange({ start, end: value })}
        />
      </div>
    </div>
  )
}
