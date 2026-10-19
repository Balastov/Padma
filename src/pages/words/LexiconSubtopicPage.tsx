import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, ImageIcon, Volume2 } from 'lucide-react'
import { fetchSubtopic } from '../../student/lexicon'
import type { StudentSubtopicWords, StudentWord } from '../../student/lexicon'
import { playExampleAudio, playWordAudio } from '../../student/audio'
import { LexiconHeader } from './LexiconTopicsPage'
import { topicLook } from './topicIcons'
import { useLevel } from './useLevel'
import './LexiconTopics.css'

const RELATED = 4

// Bold the studied word inside its example; sense notes like "[visit]" and
// optional parts "(sb)" are not part of the sentence.
function highlight(sentence: string, term: string): ReactNode {
  const bare = term.replace(/\s*(\[[^\]]*\]|\([^)]*\))/g, '').trim()
  const at = bare ? sentence.toLowerCase().indexOf(bare.toLowerCase()) : -1
  if (at < 0) return sentence
  return (
    <>
      {sentence.slice(0, at)}
      <mark>{sentence.slice(at, at + bare.length)}</mark>
      {sentence.slice(at + bare.length)}
    </>
  )
}

/** Picture slot: shows a calm placeholder until pictures are uploaded. */
function Picture({ topic, size = 28 }: { topic: string; size?: number }) {
  const { Icon, hue } = topicLook(topic)
  return (
    <span
      className="lx-picture"
      style={{ '--topic-hue': hue } as CSSProperties}
      aria-hidden="true"
    >
      <Icon size={size} />
    </span>
  )
}

function AudioButton({
  label,
  onPlay,
  large,
}: {
  label: string
  onPlay: () => void
  large?: boolean
}) {
  return (
    <button
      type="button"
      className={`lx-audio${large ? ' lx-audio--large' : ''}`}
      aria-label={label}
      onClick={onPlay}
    >
      <Volume2 size={large ? 20 : 16} />
    </button>
  )
}

function WordDetails({ word, topic }: { word: StudentWord; topic: string }) {
  return (
    <article className="glass-panel lx-word-card">
      <div className="lx-word-card__picture">
        <Picture topic={topic} size={48} />
        <small>
          <ImageIcon size={14} aria-hidden="true" /> Картинка появится позже
        </small>
      </div>
      <div className="lx-word-card__title">
        <h2>{word.term}</h2>
        <AudioButton
          large
          label={`Произношение: ${word.term}`}
          onPlay={() => void playWordAudio(word.term)}
        />
      </div>
      {word.transcription && <p className="ipa">/{word.transcription}/</p>}
      <div className="lx-word-card__tags">
        {word.level && <span className="lx-pill">{word.level}</span>}
        <span className="lx-pill">{topic}</span>
        {word.pos && <span className="lx-pill lx-pill--muted">{word.pos}</span>}
      </div>
      <p className="lx-word-card__translation">{word.translation}</p>
      {word.sentence && (
        <section className="lx-example">
          <h3>Пример в контексте</h3>
          <div className="lx-example__box">
            <p>{highlight(word.sentence, word.term)}</p>
            <AudioButton
              label="Прослушать пример"
              onPlay={() => playExampleAudio(word.sentence)}
            />
            {word.sentenceTranslation && (
              <p className="secondary">{word.sentenceTranslation}</p>
            )}
          </div>
        </section>
      )}
    </article>
  )
}

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
  const index = Math.max(
    words.findIndex((w) => w.id === selected),
    0,
  )
  const current = words[index]
  // Related words: the next words of the same subtopic.
  const related = words.length
    ? Array.from({ length: Math.min(RELATED, words.length - 1) }, (_, i) =>
        words[(index + 1 + i) % words.length],
      )
    : []

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
          <nav className="lx-crumbs" aria-label="Путь">
            <Link to="/words/dictionary/topics">Словарь</Link>
            <ChevronRight size={14} aria-hidden="true" />
            <Link to="/words/dictionary/topics">Темы</Link>
            <ChevronRight size={14} aria-hidden="true" />
            <Link to={`/words/dictionary/topics/${topicId}`}>{sub.topicTitle}</Link>
            <ChevronRight size={14} aria-hidden="true" />
            <span aria-current="page">{sub.title}</span>
          </nav>
          {!words.length ? (
            <p className="empty-state">В этой подтеме пока нет слов.</p>
          ) : (
            <div className="lx-words">
              <section className="glass-panel lx-word-table">
                <table>
                  <thead>
                    <tr>
                      <th>Слово</th>
                      <th>Перевод</th>
                      <th>Транскрипция</th>
                      <th>Аудио</th>
                    </tr>
                  </thead>
                  <tbody>
                    {words.map((w) => (
                      <tr
                        key={w.id}
                        className={w.id === current?.id ? 'is-active' : ''}
                        onClick={() => setSelected(w.id)}
                      >
                        <td>
                          <button type="button" onClick={() => setSelected(w.id)}>
                            {w.term}
                          </button>
                        </td>
                        <td>{w.translation}</td>
                        <td className="ipa">
                          {w.transcription && `/${w.transcription}/`}
                        </td>
                        <td>
                          <AudioButton
                            label={`Произношение: ${w.term}`}
                            onPlay={() => void playWordAudio(w.term)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              {current && <WordDetails word={current} topic={sub.topicTitle} />}
              <section className="glass-panel lx-related">
                <h2>Связанные слова</h2>
                <ul>
                  {related.map((w) => (
                    <li key={w.id}>
                      <button type="button" onClick={() => setSelected(w.id)}>
                        <Picture topic={sub.topicTitle} size={22} />
                        <span>
                          <strong>{w.term}</strong>
                          {w.transcription && (
                            <span className="ipa">/{w.transcription}/</span>
                          )}
                          <small>{w.translation}</small>
                          {w.level && <span className="lx-pill">{w.level}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  )
}
