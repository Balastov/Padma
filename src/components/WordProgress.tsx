import { useState } from 'react'
import { PERIOD_LABELS } from '../student/lexicon'
import type { SkillKey, WordMetrics } from '../student/lexicon'
import { WordAudioButton } from '../pages/words/WordAudioButton'
import './WordProgress.css'

// Word progress shared by «Мои слова → Прогресс» and «Лексика → Прогресс».

const SKILLS: [SkillKey, string, string][] = [
  ['comprehension', 'Понимание', 'Выбор перевода, верно — неверно, пары'],
  ['recall', 'Вспоминание', 'Тренировочные карточки'],
  ['listening', 'Аудирование', 'Форматы с аудио'],
  ['writing', 'Написание', 'Собери слово, найди слово'],
]

const plural = (n: number, forms: [string, string, string]) => {
  const tail = n % 100 > 10 && n % 100 < 20 ? 5 : n % 10
  return forms[tail === 1 ? 0 : tail >= 2 && tail <= 4 ? 1 : 2]
}
const dayDate = (day: string) => new Date(day + 'T12:00:00Z')
const fmt = (day: string, options: Intl.DateTimeFormatOptions) =>
  dayDate(day).toLocaleDateString('ru-RU', { timeZone: 'UTC', ...options })

function Activity({ metrics }: { metrics: WordMetrics }) {
  const [hover, setHover] = useState<number | null>(null)
  const { activity } = metrics
  const max = Math.max(...activity.map((d) => d.attempts), 1)
  // A round top value for the single grid line.
  const step = max <= 10 ? 5 : max <= 50 ? 10 : 50
  const top = Math.ceil(max / step) * step
  const total = activity.reduce((t, d) => t + d.attempts, 0)
  const short = activity.length <= 7
  const label = (i: number) => {
    const day = activity[i].day
    if (short) return fmt(day, { weekday: 'short' })
    // About five labels on long periods, always the last day.
    const every = Math.ceil(activity.length / 5)
    return (activity.length - 1 - i) % every === 0
      ? fmt(day, { day: 'numeric', month: 'short' })
      : ''
  }
  const shown = hover === null ? null : activity[hover]
  return (
    <section className="glass-panel word-progress__panel">
      <div className="word-progress__head">
        <h2>Активность в изучении слов</h2>
        <span className="caption">
          {total} {plural(total, ['упражнение', 'упражнения', 'упражнений'])}{' '}
          {PERIOD_LABELS[metrics.days] || ''}
        </span>
      </div>
      <div className="wp-chart" onMouseLeave={() => setHover(null)}>
        <span className="wp-chart__top" aria-hidden="true">
          {top}
        </span>
        <div
          className="wp-chart__bars"
          style={{ gap: short ? 10 : 2 }}
          role="img"
          aria-label={`Упражнений по дням ${PERIOD_LABELS[metrics.days] || ''}`}
        >
          {activity.map((d, i) => (
            <button
              key={d.day}
              type="button"
              className={`wp-chart__slot${hover === i ? ' is-hover' : ''}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${fmt(d.day, { day: 'numeric', month: 'long' })}: ${d.attempts} ${plural(d.attempts, ['упражнение', 'упражнения', 'упражнений'])}, ${d.words} ${plural(d.words, ['слово', 'слова', 'слов'])}`}
            >
              <span
                className="wp-chart__bar"
                style={{ height: d.attempts ? `${(d.attempts / top) * 100}%` : 0 }}
              />
            </button>
          ))}
        </div>
        <div className="wp-chart__axis" aria-hidden="true">
          {activity.map((d, i) => (
            <span key={d.day}>{label(i)}</span>
          ))}
        </div>
        {shown && (
          <div
            className="wp-chart__tip"
            style={{
              left: `${((hover! + 0.5) / activity.length) * 100}%`,
              // Edge bars keep the tooltip inside the panel.
              transform: `translateX(${
                hover! < activity.length * 0.2
                  ? '-10%'
                  : hover! >= activity.length * 0.8
                    ? '-90%'
                    : '-50%'
              })`,
            }}
          >
            <strong>{fmt(shown.day, { weekday: 'short', day: 'numeric', month: 'long' })}</strong>
            <span>
              {shown.attempts} {plural(shown.attempts, ['упражнение', 'упражнения', 'упражнений'])}
            </span>
            <span>
              {shown.words} {plural(shown.words, ['слово', 'слова', 'слов'])}
            </span>
          </div>
        )}
      </div>
      <p className="caption">
        Каждое выполненное упражнение — одна попытка, верная или нет. Дни — по
        часовому поясу ученика.
      </p>
    </section>
  )
}

function Skills({ metrics }: { metrics: WordMetrics }) {
  return (
    <section className="glass-panel word-progress__panel">
      <div className="word-progress__head">
        <h2>Успешность по типам упражнений</h2>
        <span className="caption">{PERIOD_LABELS[metrics.days] || ''}</span>
      </div>
      <ul className="wp-skills">
        {SKILLS.map(([key, title, hint]) => {
          const s = metrics.skills[key]
          return (
            <li key={key}>
              <div className="wp-skills__row">
                <span>
                  <strong>{title}</strong>
                  <small>{hint}</small>
                </span>
                <b className={s.value === null ? 'is-empty' : ''}>
                  {s.value === null ? 'Недостаточно данных' : `${s.value}%`}
                </b>
              </div>
              <div className="wp-meter" aria-hidden="true">
                <span style={{ width: `${s.value || 0}%` }} />
              </div>
              {s.value !== null && (
                <small className="wp-skills__sample">
                  {s.words} {plural(s.words, ['слово', 'слова', 'слов'])} ·{' '}
                  {s.attempts} {plural(s.attempts, ['ответ', 'ответа', 'ответов'])}
                  {s.lowSample && ' · мало данных, значение предварительное'}
                </small>
              )}
            </li>
          )
        })}
      </ul>
      <p className="caption">
        По последним пяти ответам на каждое слово, без подсказок; пропуск
        считается ошибкой.
      </p>
    </section>
  )
}

export default function WordProgress({
  metrics,
  student = true,
}: {
  metrics: WordMetrics
  /** Wording for the student's own page or for the teacher. */
  student?: boolean
}) {
  const { words, streak } = metrics
  const streakNote = streak.today
    ? 'сегодня занятие уже есть'
    : streak.current
      ? student
        ? 'позанимайтесь сегодня, чтобы продолжить'
        : 'сегодня занятий ещё не было'
      : student
        ? 'начните сегодня'
        : 'нет действующей серии'
  return (
    <div className="word-progress">
      <section className="word-progress__stats">
        <div className="glass-panel">
          <small>Освоено слов</small>
          <strong>{words.mastered}</strong>
          <span className="caption">уверенно знает, проверено во времени</span>
        </div>
        <div className="glass-panel">
          <small>Закрепляется</small>
          <strong>{words.reviewing}</strong>
          <span className="caption">знакомы, но ещё нужны повторения</span>
        </div>
        <div className="glass-panel">
          <small>Новые слова {PERIOD_LABELS[metrics.days] || ''}</small>
          <strong>{metrics.newWords}</strong>
          <span className="caption">впервые в упражнениях</span>
        </div>
        <div className="glass-panel">
          <small>Серия дней</small>
          <strong>{streak.current}</strong>
          <span className="caption">{streakNote}</span>
        </div>
      </section>
      <div className="word-progress__grid">
        <Activity metrics={metrics} />
        <Skills metrics={metrics} />
      </div>
      <section className="glass-panel word-progress__panel">
        <h2>Слова, к которым стоит вернуться</h2>
        {metrics.revisit.length ? (
          <div className="wp-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Слово</th>
                  <th>Транскрипция</th>
                  <th>Перевод</th>
                  <th>Освоение</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {metrics.revisit.map((w) => (
                  <tr key={w.id}>
                    <td>{w.term}</td>
                    <td className="ipa">{w.transcription}</td>
                    <td>{w.translation}</td>
                    <td>{w.mastery}%</td>
                    <td>
                      <WordAudioButton word={w.term} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="caption">
            Здесь появятся слова с ошибками, которые ещё не освоены.
          </p>
        )}
      </section>
    </div>
  )
}
