import { BookOpen, Library, Play } from 'lucide-react'
import { LexiconHeader } from './LexiconTopicsPage'
import { useLevel } from './useLevel'
import './LexiconTopics.css'

const Lines = ({ count }: { count: number }) => (
  <ul className="lx-stub-lines" aria-hidden="true">
    {Array.from({ length: count }, (_, i) => (
      <li key={i}>
        <span className="lx-stub-thumb" />
        <span className="lx-stub-text">
          <span />
          <span />
        </span>
      </li>
    ))}
  </ul>
)

/** «Слова уроков»: layout of the future section, no data yet. */
export function LessonsStubPage() {
  const [level, setLevel] = useLevel()
  return (
    <div className="dict-page">
      <LexiconHeader level={level} onLevel={setLevel} />
      <div className="lx-layout lx-stub">
        <aside className="glass-panel lx-topics">
          <h2>Уроки курса</h2>
          <Lines count={5} />
        </aside>
        <div className="lx-detail">
          <section className="glass-panel lx-stub-hero">
            <BookOpen size={28} aria-hidden="true" />
            <div>
              <h2>Слова уроков появятся здесь</h2>
              <p className="secondary">
                После занятий здесь будут слова каждого урока: сколько освоено,
                что новое и что стоит повторить.
              </p>
            </div>
          </section>
          <section className="glass-panel lx-subtopics">
            <h2>Слова из урока</h2>
            <Lines count={4} />
            <button type="button" className="button-secondary" disabled>
              <Play size={16} /> В тренажёр
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}

/** «Коллекции»: layout of the future section, no data yet. */
export function CollectionsStubPage() {
  const [level, setLevel] = useLevel()
  return (
    <div className="dict-page">
      <LexiconHeader level={level} onLevel={setLevel} />
      <div className="lx-collections lx-stub">
        <div className="lx-collections__grid">
          {Array.from({ length: 4 }, (_, i) => (
            <section key={i} className="glass-panel lx-stub-card" aria-hidden="true">
              <span className="lx-stub-thumb lx-stub-thumb--large" />
              <span className="lx-stub-text">
                <span />
                <span />
                <span />
              </span>
            </section>
          ))}
        </div>
        <section className="glass-panel lx-stub-hero lx-stub-hero--side">
          <Library size={28} aria-hidden="true" />
          <div>
            <h2>Коллекции скоро появятся</h2>
            <p className="secondary">
              Здесь можно будет собирать свои наборы слов — «Моё путешествие»,
              «Для экзамена» — и тренировать их отдельно.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
