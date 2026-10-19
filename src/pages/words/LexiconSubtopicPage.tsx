import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Play } from 'lucide-react'
import { fetchSubtopic, toVocabWord } from '../../student/lexicon'
import type { StudentSubtopicWords } from '../../student/lexicon'
import { statusLabel } from '../../student/progressStore'
import type { WordStatus } from '../../student/types'
import { wordsCount } from '../../components/lexiconFormat'
import { WordCard } from './DictionaryPages'
import { WordAudioButton } from './WordAudioButton'
import { LexiconHeader } from './LexiconTopicsPage'
import { useLevel } from './useLevel'
import './LexiconTopics.css'

const STATUSES: WordStatus[] = ['new', 'learning', 'reviewing', 'mastered']

export default function LexiconSubtopicPage() {
  const { topicId, subtopicId } = useParams()
  const [level, setLevel] = useLevel()
  const [data, setData] = useState<StudentSubtopicWords | null>(null)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetchSubtopic(subtopicId || '')
      .then((d) => {
        if (!active) return
        setData(d)
        setError('')
      })
      .catch((e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [subtopicId])

  const sub = data?.id === subtopicId ? data : null
  const words = sub?.words || []
  const current = words.find((w) => w.id === selected) || words[0]
  const counts = STATUSES.map(
    (s) => [s, words.filter((w) => w.status === s).length] as const,
  )

  return (
    <div className="dict-page">
      <LexiconHeader level={level} onLevel={setLevel} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!sub && !error && <p role="status">Загружаем слова…</p>}
      {sub && (
        <>
          <div className="lx-crumbs">
            <Link className="text-button" to={`/words/dictionary/topics/${topicId}`}>
              <ArrowLeft size={16} /> {sub.topicTitle}
            </Link>
            <h1>{sub.title}</h1>
          </div>
          <div className="lx-words">
            <section className="glass-panel lx-word-list">
              <h2>Слова · {words.length}</h2>
              <ul>
                {words.map((w) => (
                  <li
                    key={w.id}
                    className={w.id === current?.id ? 'is-active' : ''}
                  >
                    <button type="button" onClick={() => setSelected(w.id)}>
                      <strong>{w.term}</strong>
                      {w.transcription && (
                        <span className="ipa">{w.transcription}</span>
                      )}
                      <small>{w.translation}</small>
                    </button>
                    <span className={`status-pill status-pill--${w.status}`}>
                      {statusLabel(w.status)}
                    </span>
                    <WordAudioButton word={w.term} />
                  </li>
                ))}
              </ul>
            </section>
            {current && <WordCard word={toVocabWord(current, sub.id)} />}
            <section className="glass-panel lx-sub-progress">
              <h2>Прогресс подтемы</h2>
              <div className="lx-sub-progress__ring">
                <span
                  className="lx-ring lx-ring--large"
                  style={{ '--percent': sub.progress.percent } as CSSProperties}
                  aria-hidden="true"
                />
                <strong>{sub.progress.percent}%</strong>
                <small>
                  освоено {sub.progress.mastered} из {wordsCount(sub.progress.total)}
                </small>
              </div>
              <ul className="lx-status-counts">
                {counts.map(([status, n]) => (
                  <li key={status}>
                    <span className={`status-pill status-pill--${status}`}>
                      {statusLabel(status)}
                    </span>
                    <strong>{n}</strong>
                  </li>
                ))}
              </ul>
              {!!words.length && (
                <Link
                  className="button-primary"
                  to={`/words/trainer?source=topic&id=${sub.id}`}
                >
                  <Play size={16} /> Тренировать подтему
                </Link>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
