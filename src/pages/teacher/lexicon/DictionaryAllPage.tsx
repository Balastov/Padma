import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, Volume2 } from 'lucide-react'
import { api } from '../../../api'
import StubMedia from '../../../components/StubMedia'
import { playWordAudio } from '../../../student/audio'
import './lexicon.css'

export type TeacherWord = {
  id: string
  word: string
  transcription: string
  translation: string
  level: string
  pos: string
  topicId: string | null
  subtopicId: string | null
  hasAudio: boolean
  exampleEn: string
  exampleRu: string
  shortMeaning: string
  lessonIds?: string[]
  collectionIds?: string[]
}

type LexiconEntry = {
  id: number
  termId: string
  term: string
  translation: string
  transcription: string
  sentence: string
  sentenceTranslation: string
  pos: string
  category: string
  unitTitle: string
  level: string
  bookId: string
  bookTitle: string
  unitId: string
  unitNumber: number
  theme: string
}
type EntriesPage = {
  total: number
  limit: number
  offset: number
  items: LexiconEntry[]
}
type LexiconBook = { id: string; title: string; level: string }
type LexiconTheme = { id: string; title: string }

const PAGE_SIZES = [20, 50, 100]

export function DictionaryChrome({
  lead,
}: {
  lead: string
}) {
  return (
    <>
      <p className="lexicon-lead">{lead}</p>
      <div className="lexicon-subtabs">
        <NavLink to="/teacher/lexicon/dictionary" end>
          Все слова
        </NavLink>
        <NavLink to="/teacher/lexicon/dictionary/topics">Темы</NavLink>
        <NavLink to="/teacher/lexicon/dictionary/lessons">
          Слова уроков
        </NavLink>
        <NavLink to="/teacher/lexicon/dictionary/collections">
          Коллекции
        </NavLink>
      </div>
    </>
  )
}

function BookFilter({
  books,
  hidden,
  onChange,
}: {
  books: LexiconBook[]
  hidden: string[]
  onChange: (hidden: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = books.filter((b) => !hidden.includes(b.id))
  const label = !hidden.length
    ? 'Уровень: все'
    : !selected.length
      ? 'Уровень: не выбран'
      : selected.length === 1
        ? selected[0].title
        : `Уровень: ${selected.length} из ${books.length}`

  return (
    <div className="lexicon-dropdown" ref={ref}>
      <button
        type="button"
        className="lexicon-dropdown__toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{label}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="lexicon-dropdown__menu">
          <label>
            <input
              type="checkbox"
              checked={!hidden.length}
              ref={(el) => {
                if (el)
                  el.indeterminate =
                    hidden.length > 0 && hidden.length < books.length
              }}
              onChange={() =>
                onChange(hidden.length ? [] : books.map((b) => b.id))
              }
            />
            (Выделить все)
          </label>
          {books.map((b) => (
            <label key={b.id}>
              <input
                type="checkbox"
                checked={!hidden.includes(b.id)}
                onChange={() =>
                  onChange(
                    hidden.includes(b.id)
                      ? hidden.filter((id) => id !== b.id)
                      : [...hidden, b.id],
                  )
                }
              />
              <span>{b.title}</span>
              {b.level && <span className="pill">{b.level}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DictionaryAllPage() {
  const [page, setPage] = useState<EntriesPage | null>(null)
  const [books, setBooks] = useState<LexiconBook[]>([])
  const [themes, setThemes] = useState<LexiconTheme[]>([])
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [hiddenBooks, setHiddenBooks] = useState<string[]>([])
  const [topicId, setTopicId] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZES[0])
  const [offset, setOffset] = useState(0)
  const [focusId, setFocusId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      api<LexiconBook[]>('/lexicon/books'),
      api<LexiconTheme[]>('/lexicon/themes'),
    ])
      .then(([b, t]) => {
        if (!active) return
        setBooks(b)
        setThemes(t)
      })
      .catch((e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(q.trim())
      setOffset(0)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [q])

  const noBooks = books.length > 0 && hiddenBooks.length >= books.length

  useEffect(() => {
    if (noBooks) return
    let active = true
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })
    if (query) params.set('q', query)
    if (hiddenBooks.length)
      for (const b of books)
        if (!hiddenBooks.includes(b.id)) params.append('bookId', b.id)
    if (topicId) params.set('topicId', topicId)
    api<EntriesPage>(`/lexicon/entries?${params}`)
      .then((result) => {
        if (!active) return
        setPage(result)
        setError('')
        setLoading(false)
      })
      .catch((e: Error) => {
        if (!active) return
        setError(e.message)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [query, books, hiddenBooks, noBooks, topicId, limit, offset])

  const items = (!noBooks && page?.items) || []
  const total = noBooks ? 0 : page?.total || 0
  const current = items.find((e) => e.id === focusId) || items[0]

  return (
    <div className="lexicon">
      <DictionaryChrome lead="Слова из учебников: перевод, транскрипция, уровень, тема и юнит" />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="lexicon-toolbar lexicon-filters">
        <label className="field">
          <span className="sr-only">Поиск</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск слова или перевода…"
          />
        </label>
        <BookFilter
          books={books}
          hidden={hiddenBooks}
          onChange={(next) => {
            setHiddenBooks(next)
            setOffset(0)
          }}
        />
        <select
          aria-label="Тема"
          value={topicId}
          onChange={(e) => {
            setTopicId(e.target.value)
            setOffset(0)
          }}
        >
          <option value="">Тема</option>
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>
      <div className="lexicon-grid-2 lexicon-dictionary">
        <section className="glass-panel lexicon-panel">
          <div className="lexicon-toolbar lexicon-pager">
            <span className="caption">
              {total
                ? `${offset + 1}–${Math.min(offset + limit, total)} из ${total.toLocaleString('ru-RU')}`
                : 'Всего: 0'}
            </span>
            <label className="lexicon-page-size">
              <span className="caption">Показывать по</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value))
                  setOffset(0)
                }}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="lexicon-table-wrap">
            <table className="lexicon-table">
              <thead>
                <tr>
                  <th>Слово</th>
                  <th>Перевод</th>
                  <th>Транскрипция</th>
                  <th>Ур.</th>
                  <th>Тема</th>
                  <th>Юнит</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr
                    key={e.id}
                    className={e.id === current?.id ? 'is-selected' : ''}
                  >
                    <td>
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => setFocusId(e.id)}
                      >
                        {e.term}
                      </button>
                    </td>
                    <td>{e.translation}</td>
                    <td className="ipa">{e.transcription}</td>
                    <td>
                      <span className="lexicon-book">{e.bookTitle}</span>
                      {e.level && <span className="pill">{e.level}</span>}
                    </td>
                    <td>{e.theme}</td>
                    <td
                      title={[e.bookTitle, e.unitTitle].filter(Boolean).join(' · ')}
                    >
                      {e.unitNumber}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Произношение: ${e.term}`}
                        onClick={() => void playWordAudio(e.term)}
                      >
                        <Volume2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !items.length && (
              <p className="empty-state">
                {noBooks ? 'Выберите хотя бы один уровень.' : 'Ничего не найдено.'}
              </p>
            )}
          </div>
          {total > limit && (
            <div className="lexicon-toolbar lexicon-pager">
              <button
                type="button"
                className="button-secondary button-small"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(offset - limit, 0))}
              >
                <ChevronLeft size={16} /> Назад
              </button>
              <span className="caption">
                Стр. {Math.floor(offset / limit) + 1} из{' '}
                {Math.ceil(total / limit)}
              </span>
              <button
                type="button"
                className="button-secondary button-small"
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
              >
                Вперёд <ChevronRight size={16} />
              </button>
            </div>
          )}
        </section>
        {current && (
          <section className="glass-panel lexicon-panel lexicon-preview">
            <StubMedia label={current.term} />
            <div className="lexicon-preview__word">{current.term}</div>
            {current.transcription && (
              <p className="ipa">{current.transcription}</p>
            )}
            <p>{current.translation}</p>
            <div className="lexicon-toolbar">
              {current.level && <span className="pill">{current.level}</span>}
              <span className="pill">Юнит {current.unitNumber}</span>
              {current.pos && <span className="pill">{current.pos}</span>}
              {current.category && (
                <span className="pill">{current.category}</span>
              )}
            </div>
            <div>
              <small>Тема</small>
              <p>{current.theme}</p>
              <p className="secondary">
                {current.bookTitle}
                {current.unitTitle &&
                  ` · ${current.unitNumber}. ${current.unitTitle}`}
              </p>
            </div>
            {current.sentence && (
              <div>
                <small>Пример</small>
                <p>{current.sentence}</p>
                {current.sentenceTranslation && (
                  <p className="secondary">{current.sentenceTranslation}</p>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
