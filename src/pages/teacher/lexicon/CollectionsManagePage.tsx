import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { api } from '../../../api'
import type { User } from '../../../api'
import StubMedia from '../../../components/StubMedia'
import { wordsCount } from '../../../components/lexiconFormat'
import AssignPanel from './AssignPanel'
import { DictionaryChrome } from './DictionaryAllPage'
import TermListEditor from './TermListEditor'
import './lexicon.css'

type Collection = {
  id: string
  title: string
  description: string
  tags: string[]
  wordIds: string[]
  wordCount: number
  updated: string
}

export default function CollectionsManagePage({
  students,
}: {
  students: User[]
}) {
  const [list, setList] = useState<Collection[]>([])
  const [params] = useSearchParams()
  // A collection found in the dictionary search opens via ?c=<id>.
  const [selectedId, setSelectedId] = useState(params.get('c') || '')
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const c = await api<Collection[]>('/vocab/collections')
      setList(c)
      if (!selectedId && c[0]) setSelectedId(c[0].id)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [selectedId])

  useEffect(() => {
    void load()
  }, [load])

  const current = list.find((c) => c.id === selectedId)
  const needle = search.trim().toLocaleLowerCase('ru')
  const shown = needle
    ? list.filter((c) => c.title.toLocaleLowerCase('ru').includes(needle))
    : list

  async function create() {
    if (!title.trim()) return
    try {
      const c = await api<Collection>('/vocab/collections', 'POST', {
        title: title.trim(),
        description: description.trim(),
        tags: [],
        wordIds: [],
      })
      setTitle('')
      setDescription('')
      await load()
      setSelectedId(c.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="lexicon">
      <DictionaryChrome lead="Собирайте полезные наборы слов и открывайте их нужным ученикам." />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="lexicon-toolbar">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название коллекции"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Краткое описание"
        />
        <button type="button" className="button-primary" onClick={create}>
          <Plus size={18} /> Создать коллекцию
        </button>
      </div>
      <label className="field lexicon-search">
        <span className="sr-only">Поиск коллекции</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск коллекции по названию…"
        />
      </label>
      <div className="lexicon-grid-2">
        <section className="lexicon-cards">
          {shown.map((c) => (
            <article
              key={c.id}
              className={
                'glass-panel lexicon-card' +
                (c.id === selectedId ? ' is-active' : '')
              }
              style={
                c.id === selectedId
                  ? { outline: '2px solid #536cff66' }
                  : undefined
              }
            >
              <StubMedia label={c.title} />
              <strong>{c.title}</strong>
              <p className="caption">{c.description}</p>
              <small>
                {wordsCount(c.wordCount)} ·{' '}
                {c.updated.slice(0, 10)}
              </small>
              <div className="lexicon-card__actions">
                <button
                  type="button"
                  className="button-primary button-small"
                  onClick={() => setSelectedId(c.id)}
                >
                  Открыть
                </button>
              </div>
            </article>
          ))}
          {!list.length && (
            <p className="empty-state glass-panel">Коллекций пока нет</p>
          )}
          {list.length > 0 && !shown.length && (
            <p className="empty-state glass-panel">
              Коллекций с таким названием нет
            </p>
          )}
        </section>
        {current && (
          <div style={{ display: 'grid', gap: 16 }}>
            <section className="glass-panel lexicon-panel">
              <StubMedia label={current.title} />
              <h2>{current.title}</h2>
              <p>{current.description}</p>
              <div className="lexicon-toolbar">
                {current.tags.map((t) => (
                  <span key={t} className="pill">
                    {t}
                  </span>
                ))}
              </div>
              <TermListEditor
                ownerId={current.id}
                path={`/lexicon/collections/${encodeURIComponent(current.id)}/terms`}
                caption="Слова коллекции"
                actionLabel="Добавить в коллекцию"
                removeLabel="Убрать из коллекции"
                filters
                onChanged={() => void load()}
              />
            </section>
            <AssignPanel
              sourceType="collection"
              sourceId={current.id}
              students={students}
            />
          </div>
        )}
      </div>
    </div>
  )
}
