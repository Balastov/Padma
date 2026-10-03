import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { api } from '../../../api'
import type { User } from '../../../api'
import StubMedia from '../../../components/StubMedia'
import AssignPanel from './AssignPanel'
import { DictionaryChrome, type TeacherWord } from './DictionaryAllPage'
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
  const [words, setWords] = useState<TeacherWord[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [pick, setPick] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [c, w] = await Promise.all([
        api<Collection[]>('/vocab/collections'),
        api<TeacherWord[]>('/vocab'),
      ])
      setList(c)
      setWords(w)
      if (!selectedId && c[0]) {
        setSelectedId(c[0].id)
        setPick(c[0].wordIds)
      }
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [selectedId])

  useEffect(() => {
    void load()
  }, [load])

  const current = list.find((c) => c.id === selectedId)

  useEffect(() => {
    if (current) setPick(current.wordIds)
  }, [current?.id])

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

  async function saveWords() {
    if (!current) return
    setBusy(true)
    try {
      await api('/vocab/collections/' + current.id + '/words', 'PUT', {
        wordIds: pick,
      })
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function toggle(id: string) {
    setPick((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
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
      <div className="lexicon-grid-2">
        <section className="lexicon-cards">
          {list.map((c) => (
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
                {c.wordCount} слов ·{' '}
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
              <button
                type="button"
                className="button-secondary button-small"
                disabled={busy}
                onClick={saveWords}
              >
                Сохранить слова ({pick.length})
              </button>
              <div className="lexicon-checks">
                {words.map((w) => (
                  <label key={w.id}>
                    <input
                      type="checkbox"
                      checked={pick.includes(w.id)}
                      onChange={() => toggle(w.id)}
                    />
                    {w.word} — {w.translation}
                  </label>
                ))}
              </div>
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
