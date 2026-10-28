import { friendlyDate } from '../api'
import type { LessonConflict } from '../api'

type Props = {
  conflicts: LessonConflict[]
  busy: boolean
  /** Without it only overlapping is offered (a single lesson). */
  onSkip?: () => void
  onOverlap: () => void
}
export default function ConflictNotice({
  conflicts,
  busy,
  onSkip,
  onOverlap,
}: Props) {
  return (
    <div className="notice conflict-notice" role="alert">
      <strong>
        {conflicts.length === 1
          ? 'Время уже занято'
          : `Время занято в ${conflicts.length} днях`}
      </strong>
      <ul>
        {conflicts.slice(0, 8).map((c) => (
          <li key={c.date + c.start}>
            {friendlyDate(c.date)}, {c.start}–{c.end} — занято {c.busyStart}–
            {c.busyEnd}
          </li>
        ))}
        {conflicts.length > 8 && <li>и ещё {conflicts.length - 8}</li>}
      </ul>
      <div className="form-actions">
        {onSkip && (
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={onSkip}
          >
            Без этих дат
          </button>
        )}
        <button
          type="button"
          className="button-secondary"
          disabled={busy}
          onClick={onOverlap}
        >
          С пересечениями
        </button>
      </div>
    </div>
  )
}
