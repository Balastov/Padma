import { WordAudioButton } from './WordAudioButton'
import { progressCounts, revisitWords } from '../../student/progressStore'
import { seed } from '../../student/mock/seed'
import './ProgressPage.css'

export default function ProgressPage() {
  const counts = progressCounts()
  const revisit = revisitWords()
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (29 - i))
    return { key: d.toISOString().slice(0, 10), active: i % 3 !== 0 && i > 5 }
  })
  return (
    <div className="progress-page">
      <p className="dict-lead">Как меняется ваш словарный запас.</p>
      <section className="progress-stats">
        <div className="glass-panel">
          <small>Освоено</small>
          <strong>{counts.mastered}</strong>
        </div>
        <div className="glass-panel">
          <small>Закрепляется</small>
          <strong>{counts.reviewing}</strong>
        </div>
        <div className="glass-panel">
          <small>Новые</small>
          <strong>{counts.neu}</strong>
        </div>
        <div className="glass-panel">
          <small>Дни практики</small>
          <strong>12</strong>
        </div>
      </section>
      <div className="progress-grid">
        <section className="glass-panel">
          <h2>Качество навыков</h2>
          <ul className="skills">
            <li>
              <span>Понимание</span>
              <strong>92%</strong>
            </li>
            <li>
              <span>Вспоминание</span>
              <strong>78%</strong>
            </li>
            <li>
              <span>Аудирование</span>
              <strong>84%</strong>
            </li>
            <li>
              <span>Написание</span>
              <strong>71%</strong>
            </li>
          </ul>
        </section>
        <section className="glass-panel">
          <h2>Дни практики</h2>
          <div className="practice-days">
            {days.map((d) => (
              <span
                key={d.key}
                className={d.active ? 'is-on' : ''}
                title={d.key}
              >
                {d.active ? '✓' : ''}
              </span>
            ))}
          </div>
          <p className="caption">Спокойные отметки без давления серии.</p>
        </section>
      </div>
      <section className="glass-panel progress-revisit">
        <h2>Слова, к которым стоит вернуться</h2>
        <table className="words-table">
          <thead>
            <tr>
              <th>Слово</th>
              <th>Транскрипция</th>
              <th>Перевод</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {revisit.map((w) => (
              <tr key={w.id}>
                <td>{w.word}</td>
                <td className="ipa">{w.transcription}</td>
                <td>{w.translation}</td>
                <td>
                  <WordAudioButton word={w.word} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="caption">
          Уровень цели: {seed.level.current} → {seed.level.goal}
        </p>
      </section>
    </div>
  )
}
