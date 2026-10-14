import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../../../api'
import { TermSearch } from '../../../components/LexiconPicker'
import type { LexiconTerm } from '../../../components/LexiconPicker'
import { wordsCount } from '../../../components/lexiconFormat'

type SubtopicTerms = { id: string; terms: LexiconTerm[] }

/** Words of a subtopic: list with removal and dictionary search to add. */
export default function SubtopicWords({
  subtopicId,
  onChanged,
}: {
  subtopicId: string
  onChanged: () => void
}) {
  const [data, setData] = useState<SubtopicTerms | null>(null)
  const [error, setError] = useState('')
  const path = `/lexicon/subtopics/${encodeURIComponent(subtopicId)}/terms`

  useEffect(() => {
    let active = true
    api<SubtopicTerms>(path)
      .then((result) => active && setData(result))
      .catch((e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [path])

  const terms = data?.id === subtopicId ? data.terms : []

  async function add(found: LexiconTerm[]) {
    const result = await api<SubtopicTerms>(path, 'POST', {
      termIds: found.map((t) => t.id),
    })
    setData(result)
    setError('')
    onChanged()
  }

  async function remove(term: LexiconTerm) {
    try {
      setData(
        await api<SubtopicTerms>(
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
      <p className="caption">Слова подтемы: {wordsCount(terms.length)}</p>
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
                aria-label={`Убрать из подтемы: ${t.term}`}
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
        actionLabel="Добавить в подтему"
        onAdd={add}
        addedIds={terms.map((t) => t.id)}
      />
    </div>
  )
}
