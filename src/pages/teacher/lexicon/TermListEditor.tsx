import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../../../api'
import { TermSearch } from '../../../components/LexiconPicker'
import type { LexiconTerm } from '../../../components/LexiconPicker'
import { wordsCount } from '../../../components/lexiconFormat'

type OwnerTerms = { id: string; terms: LexiconTerm[] }

/** Dictionary words of a subtopic or a collection: list with removal and
 *  dictionary search to add. `path` is the owner's `/terms` endpoint. */
export default function TermListEditor({
  ownerId,
  path,
  caption,
  actionLabel,
  removeLabel,
  filters = false,
  onChanged,
}: {
  ownerId: string
  path: string
  caption: string
  actionLabel: string
  removeLabel: string
  filters?: boolean
  onChanged: () => void
}) {
  const [data, setData] = useState<OwnerTerms | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api<OwnerTerms>(path)
      .then((result) => active && setData(result))
      .catch((e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [path])

  const terms = data?.id === ownerId ? data.terms : []

  async function add(found: LexiconTerm[]) {
    const result = await api<OwnerTerms>(path, 'POST', {
      termIds: found.map((t) => t.id),
    })
    setData(result)
    setError('')
    onChanged()
  }

  async function remove(term: LexiconTerm) {
    try {
      setData(
        await api<OwnerTerms>(
          `${path}/${encodeURIComponent(term.id)}`,
          'DELETE',
        ),
      )
      setError('')
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="lexicon-sub-words">
      <p className="caption">
        {caption}: {wordsCount(terms.length)}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!!terms.length && (
        <ul className="lexicon-sub-words__list lexicon-fill">
          {terms.map((t) => (
            <li key={t.id}>
              <span>
                <strong>{t.term}</strong> — {t.translation}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={`${removeLabel}: ${t.term}`}
                onClick={() => void remove(t)}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <small>Добавить слова из словаря</small>
      <TermSearch
        actionLabel={actionLabel}
        onAdd={add}
        addedIds={terms.map((t) => t.id)}
        filters={filters}
      />
    </div>
  )
}
