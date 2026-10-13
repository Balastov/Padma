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

/** Dictionary search (English and Russian) with checkboxes. */
export function TermSearch({
  actionLabel,
  onAdd,
  addedIds = [],
}: {
  actionLabel: string
  onAdd: (terms: LexiconTerm[]) => void | Promise<void>
  addedIds?: string[]
}) {
  const [q, setQ] = useState('')
  const [result, setResult] = useState<SearchPage | null>(null)
  const [checked, setChecked] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const query = q.trim()
    if (!query) return
    let active = true
    const timer = window.setTimeout(() => {
      api<SearchPage>(
        `/lexicon/search?limit=30&q=${encodeURIComponent(query)}`,
      )
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
  }, [q])

  const items = (q.trim() && result?.items) || []
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
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {q.trim() && result && (
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
