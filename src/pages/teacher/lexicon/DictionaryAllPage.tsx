import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Plus, Volume2 } from 'lucide-react'
import { api } from '../../../api'
import type { User } from '../../../api'
import StubMedia from '../../../components/StubMedia'
import AssignPanel from './AssignPanel'
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

type Topic = { id: string; title: string }

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

export default function DictionaryAllPage({ students }: { students: User[] }) {
  const [words, setWords] = useState<TeacherWord[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [q, setQ] = useState('')
  const [level, setLevel] = useState('')
  const [topicId, setTopicId] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [focusId, setFocusId] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [w, t] = await Promise.all([
        api<TeacherWord[]>('/vocab'),
        api<Topic[]>('/vocab/topics'),
      ])
      setWords(w)
      setTopics(t)
      setError('')
      if (!focusId && w[0]) setFocusId(w[0].id)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [focusId])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return words.filter((w) => {
      if (level && w.level !== level) return false
      if (topicId && w.topicId !== topicId) return false
      if (!s) return true
      return (
        w.word.toLowerCase().includes(s) ||
        w.translation.toLowerCase().includes(s) ||
        w.transcription.toLowerCase().includes(s)
      )
    })
  }, [words, q, level, topicId])

  const current = words.find((w) => w.id === focusId) || filtered[0]

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  return (
    <div className="lexicon">
      <DictionaryChrome lead="Создавайте словарь, с которым ученикам легко работать" />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="lexicon-toolbar">
        <label className="field">
          <span className="sr-only">Поиск</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск слова, перевода или темы…"
          />
        </label>
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">Уровень</option>
          {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          <option value="">Тема</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <Link
          className="button-primary button-small"
          to="/teacher/lexicon/dictionary/words/new"
        >
          <Plus size={16} /> Добавить слово
        </Link>
      </div>
      <div className="lexicon-grid-2">
        <section className="glass-panel lexicon-panel">
          <div className="lexicon-toolbar">
            <span className="caption">
              Выбрано: {selected.length} · Всего: {filtered.length}
            </span>
            {selected.length > 0 && (
              <span className="caption">
                Назначьте выбранные справа →
              </span>
            )}
          </div>
          <div className="lexicon-table-wrap">
            <table className="lexicon-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Слово</th>
                  <th>Перевод</th>
                  <th>IPA</th>
                  <th>Ур.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => (
                  <tr
                    key={w.id}
                    className={w.id === current?.id ? 'is-selected' : ''}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(w.id)}
                        onChange={() => toggle(w.id)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => setFocusId(w.id)}
                      >
                        {w.word}
                      </button>
                    </td>
                    <td>{w.translation}</td>
                    <td className="ipa">{w.transcription}</td>
                    <td>{w.level && <span className="pill">{w.level}</span>}</td>
                    <td>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Аудио"
                        onClick={() => void playWordAudio(w.word, w.id)}
                      >
                        <Volume2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <p className="empty-state">Слов пока нет — добавьте первое.</p>
            )}
          </div>
        </section>
        <div style={{ display: 'grid', gap: 16 }}>
          {current && (
            <section className="glass-panel lexicon-panel lexicon-preview">
              <StubMedia label={current.word} />
              <div className="lexicon-preview__word">{current.word}</div>
              <p className="ipa">{current.transcription}</p>
              <p>{current.translation}</p>
              <div className="lexicon-toolbar">
                {current.level && <span className="pill">{current.level}</span>}
                {current.pos && <span className="pill">{current.pos}</span>}
              </div>
              {current.exampleEn && (
                <div>
                  <small>Пример</small>
                  <p>{current.exampleEn}</p>
                  <p className="secondary">{current.exampleRu}</p>
                </div>
              )}
              <Link
                className="button-secondary"
                to={`/teacher/lexicon/dictionary/words/${current.id}`}
              >
                Редактировать
              </Link>
            </section>
          )}
          {selected.length > 0 && (
            <AssignPanel
              sourceType="words"
              sourceId=""
              wordIds={selected}
              students={students}
            />
          )}
        </div>
      </div>
    </div>
  )
}
