import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChartColumn,
  ChevronRight,
  Layers,
  Play,
  Search,
  Target,
} from 'lucide-react'
import { fetchBooks, fetchTopic, fetchTopics, searchTerms } from '../../student/lexicon'
import type {
  LexiconBook,
  SearchTerm,
  StudentTopic,
  StudentTopicDetail,
} from '../../student/lexicon'
import { wordsCount } from '../../components/lexiconFormat'
import { WordAudioButton } from './WordAudioButton'
import { topicLook } from './topicIcons'
import { useLevel } from './useLevel'
import './LexiconTopics.css'

const hueStyle = (title: string) =>
  ({ '--topic-hue': topicLook(title).hue }) as CSSProperties

function TopicTile({ title, size = 20 }: { title: string; size?: number }) {
  const { Icon } = topicLook(title)
  return (
    <span className="lx-tile" style={hueStyle(title)} aria-hidden="true">
      <Icon size={size} />
    </span>
  )
}

function ProgressRing({ percent }: { percent: number }) {
  return (
    <span
      className="lx-ring"
      style={{ '--percent': percent } as CSSProperties}
      aria-hidden="true"
    />
  )
}

/** Shared header: dictionary sub-tabs, search and level filter. */
export function LexiconHeader({
  level,
  onLevel,
}: {
  level: string
  onLevel: (bookId: string) => void
}) {
  const [books, setBooks] = useState<LexiconBook[]>([])
  const [q, setQ] = useState('')
  const [found, setFound] = useState<SearchTerm[] | null>(null)

  useEffect(() => {
    let active = true
    fetchBooks()
      .then((b) => active && setBooks(b))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const query = q.trim()
    if (!query) return
    let active = true
    const timer = window.setTimeout(() => {
      searchTerms(query)
        .then((items) => active && setFound(items))
        .catch(() => active && setFound([]))
    }, 300)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [q])

  const results = q.trim() ? found : null
  return (
    <>
      <p className="dict-lead">
        Изучайте слова по темам и сохраняйте то, что вам интересно.
      </p>
      <div className="lx-header">
        <nav className="lx-subtabs glass-panel" aria-label="Разделы словаря">
          <NavLink to="/words/dictionary/topics">Темы</NavLink>
          <NavLink to="/words/dictionary/lessons">Слова уроков</NavLink>
          <NavLink to="/words/dictionary/collections">Коллекции</NavLink>
        </nav>
        <label className="lx-search glass-panel">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Поиск по словарю</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск слова или перевода…"
          />
        </label>
        <label className="lx-level glass-panel">
          <span className="sr-only">Уровень</span>
          <select value={level} onChange={(e) => onLevel(e.target.value)}>
            <option value="">Все уровни</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.level ? `${b.level} · ${b.title}` : b.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {results && (
        <section className="glass-panel lx-results" aria-live="polite">
          {!results.length ? (
            <p className="caption">Ничего не найдено.</p>
          ) : (
            <ul>
              {results.map((t) => {
                const unit = t.units.find((u) => u.subtopicId && u.topicId)
                return (
                  <li key={t.id}>
                    <WordAudioButton word={t.term} />
                    <span className="lx-results__word">
                      <strong>{t.term}</strong>
                      {t.transcription && (
                        <span className="ipa">{t.transcription}</span>
                      )}
                      <small>{t.translation}</small>
                    </span>
                    {unit && (
                      <Link
                        className="lx-results__link"
                        to={`/words/dictionary/topics/${unit.topicId}/${unit.subtopicId}`}
                      >
                        {unit.number}. {unit.title}
                        {unit.level && ` · ${unit.level}`}
                        <ChevronRight size={16} />
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
    </>
  )
}

export default function LexiconTopicsPage() {
  const { topicId } = useParams()
  const [level, setLevel] = useLevel()
  const [topics, setTopics] = useState<StudentTopic[] | null>(null)
  const [detail, setDetail] = useState<StudentTopicDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetchTopics(level)
      .then((list) => {
        if (!active) return
        setTopics(list)
        setError('')
      })
      .catch((e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [level])

  // Desktop shows the first topic when none is chosen; phones show the list.
  const shownId = topicId || topics?.[0]?.id || ''
  useEffect(() => {
    if (!shownId) return
    let active = true
    fetchTopic(shownId, level)
      .then((d) => active && setDetail(d))
      .catch((e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [shownId, level])

  const main = topics?.filter((t) => t.kind === 'main') || []
  const lexical = topics?.filter((t) => t.kind === 'lexical') || []
  const current = detail?.id === shownId ? detail : null

  const topicList = (list: StudentTopic[]) => (
    <ul className="lx-topic-list">
      {list.map((t) => (
        <li key={t.id}>
          <Link
            to={`/words/dictionary/topics/${t.id}`}
            className={t.id === shownId ? 'is-active' : ''}
            aria-current={t.id === shownId ? 'page' : undefined}
          >
            <TopicTile title={t.title} />
            <span>
              <strong>{t.title}</strong>
              <small>{wordsCount(t.termCount)}</small>
            </span>
            <ChevronRight size={16} />
          </Link>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="dict-page">
      <LexiconHeader level={level} onLevel={setLevel} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!topics && !error && <p role="status">Загружаем темы…</p>}
      {topics && !topics.length && (
        <p className="empty-state">На этом уровне пока нет тем.</p>
      )}
      {!!topics?.length && (
        <div className={`lx-layout${topicId ? ' has-topic' : ''}`}>
          <aside className="glass-panel lx-topics">
            <h2>Основные темы</h2>
            {topicList(main)}
            {!!lexical.length && (
              <>
                <h2>Лексические группы</h2>
                {topicList(lexical)}
              </>
            )}
          </aside>
          <div className="lx-detail">
            {!current ? (
              <p role="status">Загружаем тему…</p>
            ) : (
              <>
                <Link className="lx-back text-button" to="/words/dictionary/topics">
                  <ArrowLeft size={16} /> Все темы
                </Link>
                <section className="glass-panel lx-hero" style={hueStyle(current.title)}>
                  <div className="lx-cover" aria-hidden="true">
                    <TopicTile title={current.title} size={44} />
                  </div>
                  <div className="lx-hero__body">
                    <h2>{current.title}</h2>
                    <p className="secondary">
                      {current.description ||
                        'Слова и выражения из учебников English Vocabulary in Use, разбитые на подтемы.'}
                    </p>
                    <div className="lx-stats">
                      <div>
                        <BookOpen size={20} aria-hidden="true" />
                        <span>
                          <strong>{current.termCount}</strong>
                          <small>всего слов</small>
                        </span>
                      </div>
                      <div>
                        <ChartColumn size={20} aria-hidden="true" />
                        <span>
                          <strong>{current.subtopics.length}</strong>
                          <small>подтем</small>
                        </span>
                      </div>
                      <div>
                        <Target size={20} aria-hidden="true" />
                        <span>
                          <small>Ваш прогресс</small>
                          <strong>{current.progress.percent}% изучено</strong>
                        </span>
                        <ProgressRing percent={current.progress.percent} />
                      </div>
                    </div>
                  </div>
                </section>
                <section
                  className="glass-panel lx-subtopics"
                  style={hueStyle(current.title)}
                >
                  <h2>Подтемы</h2>
                  {!current.subtopics.length && (
                    <p className="caption">
                      <Layers size={16} aria-hidden="true" /> Подтемы на этом
                      уровне пока не добавлены.
                    </p>
                  )}
                  <ul>
                    {current.subtopics.map((s) => (
                      <li key={s.id}>
                        <span className="lx-thumb" aria-hidden="true">
                          <TopicTile title={current.title} size={22} />
                        </span>
                        <span className="lx-sub__title">
                          <strong>{s.title}</strong>
                          <small>
                            {wordsCount(s.termCount)}
                            {s.level && ` · ${s.level}`}
                          </small>
                        </span>
                        <span
                          className="lx-bar"
                          role="progressbar"
                          aria-label={`Прогресс: ${s.title}`}
                          aria-valuenow={s.progress.percent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <span style={{ width: `${s.progress.percent}%` }} />
                        </span>
                        <span className="lx-percent">{s.progress.percent}%</span>
                        <span className="lx-sub__actions">
                          <Link
                            className="button-primary button-small"
                            to={`/words/dictionary/topics/${current.id}/${s.id}`}
                          >
                            Открыть <ArrowRight size={16} />
                          </Link>
                          <Link
                            className="button-secondary button-small"
                            to={`/words/trainer?source=topic&id=${s.id}`}
                          >
                            <Play size={14} /> В тренажёр
                          </Link>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
