import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { api, fullName } from '../../../api'
import type { User } from '../../../api'

type Group = {
  id: string
  title: string
  studentIds: string[]
}

type Props = {
  sourceType: 'topic' | 'subtopic' | 'collection' | 'lesson' | 'words'
  sourceId: string
  wordIds?: string[]
  exercises?: string[]
  students: User[]
  onDone?: () => void
}

export default function AssignPanel({
  sourceType,
  sourceId,
  wordIds,
  exercises,
  students,
  onDone,
}: Props) {
  const [tab, setTab] = useState<'students' | 'groups'>('students')
  const [groups, setGroups] = useState<Group[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [groupTitle, setGroupTitle] = useState('')

  useEffect(() => {
    api<Group[]>('/vocab/groups')
      .then(setGroups)
      .catch(() => setGroups([]))
  }, [])

  function toggle(id: string) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function assign() {
    if (!picked.length) {
      setMsg('Выберите учеников или группы')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      await api('/vocab/assignments', 'POST', {
        sourceType,
        sourceId: sourceType === 'words' ? undefined : sourceId,
        wordIds: sourceType === 'words' ? wordIds || [] : undefined,
        targetType: tab === 'students' ? 'student' : 'group',
        targetIds: picked,
        exercises,
      })
      setMsg('Назначено')
      setPicked([])
      onDone?.()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function createGroup() {
    if (!groupTitle.trim()) return
    try {
      const g = await api<Group>('/vocab/groups', 'POST', {
        title: groupTitle.trim(),
        studentIds: [],
      })
      setGroups((prev) => [...prev, g])
      setGroupTitle('')
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  return (
    <aside className="glass-panel lexicon-panel">
      <h3>Кому доступно</h3>
      <div className="lexicon-subtabs">
        <button
          type="button"
          className={tab === 'students' ? 'active' : ''}
          style={{
            padding: '8px 14px',
            borderRadius: 999,
            border: '1px solid #6375b424',
            background: tab === 'students' ? 'var(--gradient-primary)' : '#fff',
            color: tab === 'students' ? '#fff' : 'inherit',
            fontWeight: 600,
            cursor: 'pointer',
          }}
          onClick={() => {
            setTab('students')
            setPicked([])
          }}
        >
          Ученики
        </button>
        <button
          type="button"
          className={tab === 'groups' ? 'active' : ''}
          style={{
            padding: '8px 14px',
            borderRadius: 999,
            border: '1px solid #6375b424',
            background: tab === 'groups' ? 'var(--gradient-primary)' : '#fff',
            color: tab === 'groups' ? '#fff' : 'inherit',
            fontWeight: 600,
            cursor: 'pointer',
          }}
          onClick={() => {
            setTab('groups')
            setPicked([])
          }}
        >
          Группы
        </button>
      </div>
      <div className="lexicon-checks">
        {tab === 'students'
          ? students.map((s) => (
              <label key={s.id}>
                <input
                  type="checkbox"
                  checked={picked.includes(s.id)}
                  onChange={() => toggle(s.id)}
                />
                {fullName(s)}
              </label>
            ))
          : groups.map((g) => (
              <label key={g.id}>
                <input
                  type="checkbox"
                  checked={picked.includes(g.id)}
                  onChange={() => toggle(g.id)}
                />
                {g.title} · {g.studentIds.length}
              </label>
            ))}
        {tab === 'students' && !students.length && (
          <p className="caption">Нет учеников</p>
        )}
        {tab === 'groups' && !groups.length && (
          <p className="caption">Групп пока нет</p>
        )}
      </div>
      {tab === 'groups' && (
        <div className="lexicon-toolbar">
          <input
            value={groupTitle}
            onChange={(e) => setGroupTitle(e.target.value)}
            placeholder="Новая группа"
          />
          <button
            type="button"
            className="button-secondary button-small"
            onClick={createGroup}
          >
            Создать
          </button>
        </div>
      )}
      <button
        type="button"
        className="button-primary"
        disabled={busy}
        onClick={assign}
      >
        <Send size={18} />
        {busy ? 'Назначаем…' : 'Назначить'}
      </button>
      {msg && <p className="caption">{msg}</p>}
      <p className="caption">
        Ученики увидят выбранный набор в своём словаре и тренажёре.
      </p>
    </aside>
  )
}
