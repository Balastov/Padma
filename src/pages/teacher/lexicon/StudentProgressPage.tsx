import { useEffect, useMemo, useState } from 'react'
import { api, fullName } from '../../../api'
import type { User } from '../../../api'
import WordProgress from '../../../components/WordProgress'
import { PERIOD_LABELS, fetchStudentMetrics } from '../../../student/lexicon'
import type { MetricsSource, WordMetrics } from '../../../student/lexicon'
import { timeZoneOptions } from '../../../timeZones'
import './lexicon.css'

type Group = { id: string; title: string; studentIds: string[] }

// Kind, group title, "all of the kind" option, prefix of one source.
const SOURCE_KINDS: [MetricsSource['type'], string, string, string][] = [
  ['homework', 'Домашние задания', 'Все домашние задания', 'ДЗ'],
  ['collection', 'Коллекции', 'Все коллекции', 'Коллекция'],
  ['topic', 'Темы словаря', 'Все темы словаря', 'Тема'],
]

export default function StudentProgressPage({ students }: { students: User[] }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [groupId, setGroupId] = useState('')
  const [studentId, setStudentId] = useState(students[0]?.id || '')
  const [days, setDays] = useState(28)
  const [source, setSource] = useState('')
  const [data, setData] = useState<
    (WordMetrics & { sources: MetricsSource[] }) | null
  >(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<Group[]>('/vocab/groups')
      .then(setGroups)
      .catch(() => setGroups([]))
  }, [])

  const group = groups.find((g) => g.id === groupId)
  const shown = useMemo(
    () =>
      group ? students.filter((s) => group.studentIds.includes(s.id)) : students,
    [group, students],
  )
  // The picked student leaves the list when the group changes.
  const current = shown.some((s) => s.id === studentId)
    ? studentId
    : shown[0]?.id || ''

  useEffect(() => {
    if (!current) return
    let active = true
    fetchStudentMetrics(current, days, source)
      .then((m) => {
        if (!active) return
        setData(m)
        setError('')
      })
      .catch((e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [current, days, source])

  const student = students.find((s) => s.id === current)
  const sources = data?.sources || []
  // A specific source picked earlier stays selectable while loading.
  const sourceKnown =
    !source.includes(':') ||
    sources.some((s) => `${s.type}:${s.id}` === source)

  return (
    <div className="lexicon">
      <p className="lexicon-lead">
        Смотрите, как ученики продвигаются, и вовремя поддерживайте повторение.
      </p>
      <div className="lexicon-toolbar lexicon-filters">
        <select
          aria-label="Группа"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
        >
          <option value="">Все группы</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Ученик"
          value={current}
          onChange={(e) => {
            setStudentId(e.target.value)
            setSource('')
          }}
          disabled={!shown.length}
        >
          {!shown.length && <option value="">Нет учеников</option>}
          {shown.map((s) => (
            <option key={s.id} value={s.id}>
              {fullName(s)}
            </option>
          ))}
        </select>
        <select
          aria-label="Период"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {[7, 28, 90].map((d) => (
            <option key={d} value={d}>
              {PERIOD_LABELS[d].replace('за', 'За')}
            </option>
          ))}
        </select>
        <select
          aria-label="Источник"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="">Все источники</option>
          {SOURCE_KINDS.map(([type, title, all, short]) => (
            <optgroup key={type} label={title}>
              <option value={type}>{all}</option>
              {sources
                .filter((s) => s.type === type)
                .map((s) => (
                  <option key={s.id} value={`${s.type}:${s.id}`}>
                    {short}: {s.label}
                  </option>
                ))}
            </optgroup>
          ))}
          {!sourceKnown && <option value={source}>Выбранный источник</option>}
        </select>
      </div>
      {!students.length ? (
        <p className="caption">У вас пока нет учеников.</p>
      ) : !shown.length ? (
        <p className="caption">В этой группе нет ваших учеников.</p>
      ) : error ? (
        <p className="notice">{error}</p>
      ) : data ? (
        <>
          <p className="caption">
            {fullName(student)} · дни по часовому поясу ученика:{' '}
            {timeZoneOptions(data.timeZone).find((z) => z.id === data.timeZone)
              ?.label || data.timeZone}
            . «Освоено» и «Закрепляется» — текущее состояние слов
            {source ? ' выбранного источника' : ''}, остальное —{' '}
            {PERIOD_LABELS[days]}.
          </p>
          <WordProgress metrics={data} student={false} />
        </>
      ) : (
        <p className="caption">Загружаем прогресс…</p>
      )}
    </div>
  )
}
