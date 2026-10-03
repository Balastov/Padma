import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Volume2 } from 'lucide-react'
import { api, friendlyDate, fullName } from '../../../api'
import type { User } from '../../../api'
import StubMedia from '../../../components/StubMedia'
import AssignPanel from './AssignPanel'
import { DictionaryChrome, type TeacherWord } from './DictionaryAllPage'
import { playWordAudio } from '../../../student/audio'
import './lexicon.css'

type Pack = {
  id: string
  title: string
  date: string
  start: string
  studentId: string
  wordIds: string[]
  wordCount: number
}

export default function LessonWordsManagePage({
  students,
}: {
  students: User[]
}) {
  const [packs, setPacks] = useState<Pack[]>([])
  const [words, setWords] = useState<TeacherWord[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [p, w] = await Promise.all([
        api<Pack[]>('/vocab/lesson-packs'),
        api<TeacherWord[]>('/vocab'),
      ])
      setPacks(p)
      setWords(w)
      if (!selectedId && p[0]) {
        setSelectedId(p[0].id)
        setPick(p[0].wordIds)
      }
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [selectedId])

  useEffect(() => {
    void load()
  }, [load])

  const pack = packs.find((p) => p.id === selectedId)
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return words
    return words.filter(
      (w) =>
        w.word.toLowerCase().includes(s) ||
        w.translation.toLowerCase().includes(s),
    )
  }, [words, q])

  useEffect(() => {
    if (pack) setPick(pack.wordIds)
  }, [pack?.id])

  function toggle(id: string) {
    setPick((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function save() {
    if (!pack) return
    setBusy(true)
    try {
      await api('/vocab/lessons/' + pack.id + '/words', 'PUT', {
        wordIds: pick,
      })
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const packWords = words.filter((w) => pick.includes(w.id))

  return (
    <div className="lexicon">
      <DictionaryChrome lead="Собирайте лексику урока так, чтобы ученикам было легко двигаться шаг за шагом" />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="lexicon-grid-2">
        <section className="glass-panel lexicon-panel">
          <div className="lexicon-toolbar">
            <h2 style={{ margin: 0, flex: 1 }}>Занятия</h2>
          </div>
          <ul className="lexicon-list">
            {packs.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={p.id === selectedId ? 'is-active' : ''}
                  onClick={() => setSelectedId(p.id)}
                >
                  <span>
                    <strong>{p.title}</strong>
                    <small style={{ display: 'block' }}>
                      {friendlyDate(p.date)} · {p.wordCount} слов ·{' '}
                      {fullName(students.find((s) => s.id === p.studentId))}
                    </small>
                  </span>
                </button>
              </li>
            ))}
            {!packs.length && (
              <li className="empty-state">
                Сначала создайте занятие в расписании.
              </li>
            )}
          </ul>
        </section>

        {pack && (
          <section className="glass-panel lexicon-panel">
            <StubMedia label={pack.title} />
            <h2>
              {pack.title} · {friendlyDate(pack.date)}
            </h2>
            <p className="caption">
              Ученик:{' '}
              {fullName(students.find((s) => s.id === pack.studentId))} ·{' '}
              {pick.length} слов
            </p>
            <div className="lexicon-toolbar">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Найти слово для добавления…"
              />
              <button
                type="button"
                className="button-primary button-small"
                disabled={busy}
                onClick={save}
              >
                <Plus size={14} /> Сохранить набор
              </button>
            </div>
            <div className="lexicon-table-wrap">
              <table className="lexicon-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Слово</th>
                    <th>Перевод</th>
                    <th>IPA</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={pick.includes(w.id)}
                          onChange={() => toggle(w.id)}
                        />
                      </td>
                      <td>{w.word}</td>
                      <td>{w.translation}</td>
                      <td className="ipa">{w.transcription}</td>
                      <td>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => void playWordAudio(w.word, w.id)}
                        >
                          <Volume2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="caption">В наборе сейчас: {packWords.length}</p>
            <AssignPanel
              sourceType="lesson"
              sourceId={pack.id}
              students={students}
            />
          </section>
        )}
      </div>
    </div>
  )
}
