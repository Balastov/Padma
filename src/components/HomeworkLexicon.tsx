import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import { api } from '../api'
import { TermChecklist, TermSearch } from './LexiconPicker'
import type { LexiconTerm } from './LexiconPicker'
import { sourceLabel, wordsCount } from './lexiconFormat'

export type LexiconSource = {
  key: string
  kind: 'topic' | 'subtopic' | 'search'
  id?: string
  title: string
  parentTitle?: string
  terms: LexiconTerm[]
  checked: string[]
}

type Topic = { id: string; title: string; termCount: number }
type TopicTerms = {
  id: string
  title: string
  subtopics: { id: string; title: string; termCount: number }[]
  terms: LexiconTerm[]
}
type SubtopicTerms = { id: string; title: string; terms: LexiconTerm[] }
type Tab = 'topic' | 'search' | 'collection' | 'lesson'

const TABS: [Tab, string, boolean][] = [
  ['topic', 'Тема / подтема', true],
  ['search', 'Поиск по словарю', true],
  ['collection', 'Коллекция', false],
  ['lesson', 'Слова уроков', false],
]

/** Collects homework vocabulary from several sources. */
export default function HomeworkLexicon({
  value,
  onChange,
}: {
  value: LexiconSource[]
  onChange: (next: LexiconSource[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('topic')
  const [topics, setTopics] = useState<Topic[]>([])
  const [topicId, setTopicId] = useState('')
  const [topic, setTopic] = useState<TopicTerms | null>(null)
  const [subId, setSubId] = useState('')
  const [sub, setSub] = useState<SubtopicTerms | null>(null)
  const [checked, setChecked] = useState<string[]>([])
  const [expanded, setExpanded] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || topics.length) return
    api<Topic[]>('/lexicon/themes')
      .then(setTopics)
      .catch((e: Error) => setError(e.message))
  }, [open, topics.length])

  useEffect(() => {
    if (!topicId) return
    let active = true
    api<TopicTerms>(`/lexicon/topics/${encodeURIComponent(topicId)}/terms`)
      .then((data) => {
        if (!active) return
        setTopic(data)
        setChecked(data.terms.map((t) => t.id))
      })
      .catch((e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [topicId])

  useEffect(() => {
    if (!subId) return
    let active = true
    api<SubtopicTerms>(`/lexicon/subtopics/${encodeURIComponent(subId)}/terms`)
      .then((data) => {
        if (!active) return
        setSub(data)
        setChecked(data.terms.map((t) => t.id))
      })
      .catch((e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [subId])

  const currentTopic = topic?.id === topicId ? topic : null
  const currentSub = subId && sub?.id === subId ? sub : null
  const preview = subId ? currentSub : currentTopic
  const previewKey = subId ? `subtopic:${subId}` : `topic:${topicId}`
  const alreadyAdded = value.some((s) => s.key === previewKey)

  const allIds = value.flatMap((s) => s.checked)
  const unique = new Set(allIds)
  const duplicates = allIds.length - unique.size
  const searchSource = value.find((s) => s.kind === 'search')

  function update(key: string, patch: Partial<LexiconSource>) {
    onChange(value.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }

  function addPreview() {
    if (!preview || !currentTopic || alreadyAdded) return
    onChange([
      ...value,
      subId
        ? {
            key: previewKey,
            kind: 'subtopic',
            id: subId,
            title: preview.title,
            parentTitle: currentTopic.title,
            terms: preview.terms,
            checked,
          }
        : {
            key: previewKey,
            kind: 'topic',
            id: topicId,
            title: currentTopic.title,
            terms: preview.terms,
            checked,
          },
    ])
  }

  function addFound(found: LexiconTerm[]) {
    if (searchSource) {
      const known = new Set(searchSource.terms.map((t) => t.id))
      const fresh = found.filter((t) => !known.has(t.id))
      update(searchSource.key, {
        terms: [...searchSource.terms, ...fresh],
        checked: [...searchSource.checked, ...fresh.map((t) => t.id)],
      })
      return
    }
    onChange([
      ...value,
      {
        key: 'search',
        kind: 'search',
        title: 'Поиск по словарю',
        terms: found,
        checked: found.map((t) => t.id),
      },
    ])
  }

  return (
    <div className="hw-lex">
      <div className="hw-lex__head">
        <span className="hw-lex__label">Лексика</span>
        <button
          type="button"
          className="button-secondary button-small"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronUp size={16} /> : <Plus size={16} />}
          {open ? 'Свернуть выбор' : 'Добавить лексику'}
        </button>
      </div>

      {open && (
        <div className="hw-lex__picker">
          <div className="hw-lex__tabs" role="tablist">
            {TABS.map(([key, label, enabled]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? 'is-active' : ''}
                onClick={() => setTab(key)}
              >
                {label}
                {!enabled && <small> · скоро</small>}
              </button>
            ))}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {tab === 'topic' && (
            <div className="hw-lex__pane">
              <div className="hw-lex__selects">
                <label>
                  Тема
                  <select
                    value={topicId}
                    onChange={(e) => {
                      setTopicId(e.target.value)
                      setSubId('')
                      setError('')
                    }}
                  >
                    <option value="">Выберите тему</option>
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} ({t.termCount})
                      </option>
                    ))}
                  </select>
                </label>
                {!!currentTopic?.subtopics.length && (
                  <label>
                    Подтема
                    <select
                      value={subId}
                      onChange={(e) => {
                        setSubId(e.target.value)
                        if (!e.target.value)
                          setChecked(currentTopic.terms.map((t) => t.id))
                      }}
                    >
                      <option value="">
                        Вся тема ({currentTopic.terms.length})
                      </option>
                      {currentTopic.subtopics.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title} ({s.termCount})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {preview && (
                <>
                  <TermChecklist
                    terms={preview.terms}
                    checked={checked}
                    onChange={setChecked}
                    empty={
                      subId
                        ? 'В подтеме пока нет слов — добавьте их в разделе «Лексика → Темы».'
                        : 'В теме пока нет слов.'
                    }
                  />
                  <button
                    type="button"
                    className="button-primary button-small"
                    disabled={alreadyAdded || !checked.length}
                    onClick={addPreview}
                  >
                    {alreadyAdded
                      ? 'Уже добавлено в задание'
                      : `Добавить в задание (${checked.length})`}
                  </button>
                </>
              )}
            </div>
          )}

          {tab === 'search' && (
            <div className="hw-lex__pane">
              <TermSearch
                actionLabel="Добавить в задание"
                onAdd={addFound}
                addedIds={searchSource?.terms.map((t) => t.id)}
              />
            </div>
          )}

          {(tab === 'collection' || tab === 'lesson') && (
            <div className="hw-lex__pane">
              <p className="caption">
                {tab === 'collection' ? 'Коллекции' : 'Слова уроков'} появятся
                позже — тогда их можно будет добавить в задание вместе с
                темами и поиском.
              </p>
            </div>
          )}
        </div>
      )}

      {!!value.length && (
        <div className="hw-lex__selected">
          <ul>
            {value.map((s) => (
              <li key={s.key}>
                <div className="hw-lex__source">
                  <button
                    type="button"
                    className="hw-lex__toggle"
                    aria-expanded={expanded === s.key}
                    onClick={() => setExpanded(expanded === s.key ? '' : s.key)}
                  >
                    {expanded === s.key ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                    <span>
                      <strong>{sourceLabel(s)}</strong>
                      <small>
                        отмечено {s.checked.length} из {s.terms.length}
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Убрать: ${sourceLabel(s)}`}
                    onClick={() => onChange(value.filter((x) => x !== s))}
                  >
                    <X size={16} />
                  </button>
                </div>
                {expanded === s.key && (
                  <TermChecklist
                    terms={s.terms}
                    checked={s.checked}
                    onChange={(next) => update(s.key, { checked: next })}
                  />
                )}
              </li>
            ))}
          </ul>
          <p className="caption">
            Итого в задании: <strong>{wordsCount(unique.size)}</strong>
            {duplicates > 0 &&
              ` · повторов: ${duplicates} — каждое слово попадёт в задание один раз`}
          </p>
        </div>
      )}
    </div>
  )
}
