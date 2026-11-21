import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import { api } from '../api'
import './LexiconPicker.css'

export type LexiconTerm = {
  id: string
  term: string
  translation: string
  transcription: string
}

/** Words with checkboxes and a select all / clear all toggle. */
export function TermChecklist({
  terms,
  checked,
  onChange,
  empty = 'Слов пока нет.',
}: {
  terms: LexiconTerm[]
  checked: string[]
  onChange: (checked: string[]) => void
  empty?: string
}) {
  if (!terms.length) return <p className="caption">{empty}</p>
  const all = terms.every((t) => checked.includes(t.id))
  return (
    <div className="lex-checklist">
      <div className="lex-checklist__bar">
        <span className="caption">
          Отмечено {terms.filter((t) => checked.includes(t.id)).length} из{' '}
          {terms.length}
        </span>
        <button
          type="button"
          className="text-button"
          onClick={() => onChange(all ? [] : terms.map((t) => t.id))}
        >
          {all ? 'Снять всё' : 'Отметить всё'}
        </button>
      </div>
      <ul className="lex-checklist__list">
        {terms.map((t) => (
          <li key={t.id}>
            <label>
              <input
                type="checkbox"
                checked={checked.includes(t.id)}
                onChange={() =>
                  onChange(
                    checked.includes(t.id)
                      ? checked.filter((id) => id !== t.id)
                      : [...checked, t.id],
                  )
                }
              />
              <span className="lex-checklist__term">{t.term}</span>
              {t.transcription && (
                <span className="lex-checklist__ipa">{t.transcription}</span>
              )}
              <span className="lex-checklist__translation">
                {t.translation}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

type SearchPage = { total: number; items: LexiconTerm[] }
type FilterBook = {
  id: string
  title: string
  units: { id: string; number: number; theme: string }[]
}
type FilterTopic = { id: string; title: string }

/** Level, unit and topic filters of the dictionary search. */
function useFilterOptions(enabled: boolean) {
  const [books, setBooks] = useState<FilterBook[]>([])
  const [topics, setTopics] = useState<FilterTopic[]>([])
  useEffect(() => {
    if (!enabled) return
    let active = true
    api<FilterBook[]>('/lexicon/books')
      .then((list) => active && setBooks(list))
      .catch(() => active && setBooks([]))
    api<FilterTopic[]>('/lexicon/themes')
      .then((list) => active && setTopics(list))
      .catch(() => active && setTopics([]))
    return () => {
      active = false
    }
  }, [enabled])
  return { books, topics }
}

/** Dictionary search (English and Russian) with checkboxes; `filters` adds
 *  level, unit and topic like on «Все слова». */
export function TermSearch({
  actionLabel,
  onAdd,
  addedIds = [],
  filters = false,
}: {
  actionLabel: string
  onAdd: (terms: LexiconTerm[]) => void | Promise<void>
  addedIds?: string[]
  filters?: boolean
}) {
  const [q, setQ] = useState('')
  const [bookId, setBookId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [topicId, setTopicId] = useState('')
  const [result, setResult] = useState<SearchPage | null>(null)
  const [checked, setChecked] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { books, topics } = useFilterOptions(filters)
  const unitBook = books.find((b) => b.id === bookId)
  const filtered = Boolean(bookId || topicId)
  const searching = Boolean(q.trim() || filtered)

  useEffect(() => {
    const query = q.trim()
    if (!query && !bookId && !topicId) return
    let active = true
    const search = new URLSearchParams({
      limit: bookId || topicId ? '100' : '30',
      q: query,
    })
    if (bookId) search.set('bookId', bookId)
    if (unitId) search.set('unitId', unitId)
    if (topicId) search.set('topicId', topicId)
    const timer = window.setTimeout(() => {
      api<SearchPage>(`/lexicon/search?${search}`)
        .then((page) => {
          if (!active) return
          setResult(page)
          setChecked([])
          setError('')
        })
        .catch((e: Error) => active && setError(e.message))
    }, 300)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [q, bookId, unitId, topicId])

  const items = (searching && result?.items) || []
  const fresh = items.filter((t) => !addedIds.includes(t.id))
  const selected = fresh.filter((t) => checked.includes(t.id))

  async function add() {
    setBusy(true)
    try {
      await onAdd(selected)
      setChecked([])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lex-search">
      <label className="lex-search__field">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Поиск по словарю</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
          placeholder="Слово или перевод — на английском или русском"
        />
      </label>
      {filters && (
        <div className="lex-search__filters">
          <select
            aria-label="Уровень"
            value={bookId}
            onChange={(e) => {
              setBookId(e.target.value)
              setUnitId('')
            }}
          >
            <option value="">Уровень: все</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
          <select
            aria-label="Юнит"
            value={unitId}
            disabled={!unitBook}
            title={unitBook ? undefined : 'Сначала выберите уровень'}
            onChange={(e) => setUnitId(e.target.value)}
          >
            <option value="">{unitBook ? 'Юнит: все' : 'Юнит'}</option>
            {unitBook?.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.number}
                {u.theme ? ` · ${u.theme}` : ''}
              </option>
            ))}
          </select>
          <select
            aria-label="Тема"
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
          >
            <option value="">Тема</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {searching && result && (
        <>
          {!items.length ? (
            <p className="caption">Ничего не найдено.</p>
          ) : (
            <>
              {result.total > items.length && (
                <p className="caption">
                  Показаны первые {items.length} из {result.total} — уточните
                  запрос.
                </p>
              )}
              <TermChecklist
                terms={fresh}
                checked={checked}
                onChange={setChecked}
                empty="Все найденные слова уже добавлены."
              />
              {items.length > fresh.length && (
                <p className="caption">
                  Уже добавлено: {items.length - fresh.length}
                </p>
              )}
            </>
          )}
          <button
            type="button"
            className="button-primary button-small"
            disabled={busy || !selected.length}
            onClick={add}
          >
            {actionLabel}
            {selected.length ? ` (${selected.length})` : ''}
          </button>
        </>
      )}
    </div>
  )
}
