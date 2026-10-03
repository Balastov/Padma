import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../api'
import type { User } from '../../../api'
import StubMedia from '../../../components/StubMedia'
import AssignPanel from './AssignPanel'
import { ALLOWED_EXERCISES, EXERCISE_META } from '../../../student/types'
import './lexicon.css'

type Pack = { id: string; title: string; wordCount: number; date: string }
type Topic = { id: string; title: string }
type TopicDetail = { subtopics: { id: string; title: string }[] }
type Collection = { id: string; title: string; wordCount: number }

export default function TrainerAssignPage({ students }: { students: User[] }) {
  const [source, setSource] = useState<'lesson' | 'topic' | 'collection'>(
    'lesson',
  )
  const [packs, setPacks] = useState<Pack[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [subs, setSubs] = useState<{ id: string; title: string }[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [lessonId, setLessonId] = useState('')
  const [topicId, setTopicId] = useState('')
  const [subId, setSubId] = useState('')
  const [collectionId, setCollectionId] = useState('')
  const [enabled, setEnabled] = useState<string[]>([...ALLOWED_EXERCISES])

  useEffect(() => {
    api<Pack[]>('/vocab/lesson-packs').then((p) => {
      setPacks(p)
      if (p[0]) setLessonId(p[0].id)
    })
    api<Topic[]>('/vocab/topics').then((t) => {
      setTopics(t)
      if (t[0]) setTopicId(t[0].id)
    })
    api<Collection[]>('/vocab/collections').then((c) => {
      setCollections(c)
      if (c[0]) setCollectionId(c[0].id)
    })
  }, [])

  useEffect(() => {
    if (!topicId) return
    api<TopicDetail>('/vocab/topics/' + topicId).then((d) => {
      setSubs(d.subtopics)
      if (d.subtopics[0]) setSubId(d.subtopics[0].id)
    })
  }, [topicId])

  const sourceId =
    source === 'lesson'
      ? lessonId
      : source === 'collection'
        ? collectionId
        : subId || topicId
  const sourceType =
    source === 'lesson'
      ? 'lesson'
      : source === 'collection'
        ? 'collection'
        : subId
          ? 'subtopic'
          : 'topic'

  const label = useMemo(() => {
    if (source === 'lesson')
      return packs.find((p) => p.id === lessonId)?.title || 'Занятие'
    if (source === 'collection')
      return collections.find((c) => c.id === collectionId)?.title || 'Коллекция'
    return (
      subs.find((s) => s.id === subId)?.title ||
      topics.find((t) => t.id === topicId)?.title ||
      'Тема'
    )
  }, [source, packs, lessonId, collections, collectionId, subs, subId, topics, topicId])

  function toggle(type: string) {
    setEnabled((prev) =>
      prev.includes(type) ? prev.filter((x) => x !== type) : [...prev, type],
    )
  }

  const groups = ['Повторение', 'Понимание', 'Аудирование', 'Игровые форматы']

  return (
    <div className="lexicon">
      <p className="lexicon-lead">
        Откройте ученикам те форматы, которые помогут закрепить нужные слова.
      </p>
      <div className="lexicon-subtabs">
        {(
          [
            ['lesson', 'Слова уроков'],
            ['topic', 'Темы'],
            ['collection', 'Коллекции'],
          ] as const
        ).map(([key, text]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSource(key)}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid #6375b424',
              background:
                source === key ? 'var(--gradient-primary)' : '#ffffff99',
              color: source === key ? '#fff' : 'inherit',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {text}
          </button>
        ))}
      </div>
      <div className="lexicon-toolbar">
        {source === 'lesson' && (
          <select
            value={lessonId}
            onChange={(e) => setLessonId(e.target.value)}
          >
            {packs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} · {p.date} ({p.wordCount})
              </option>
            ))}
          </select>
        )}
        {source === 'topic' && (
          <>
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
            >
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <select value={subId} onChange={(e) => setSubId(e.target.value)}>
              <option value="">Вся тема</option>
              {subs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </>
        )}
        {source === 'collection' && (
          <select
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.wordCount})
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="lexicon-grid-2">
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="glass-panel lexicon-panel">
            <StubMedia label={label} />
            <h2>Текущий набор: {label}</h2>
            <p className="caption">
              Включено форматов: {enabled.length} из {ALLOWED_EXERCISES.length}
            </p>
          </section>
          <div className="lexicon-formats">
            {groups.map((group) => (
              <section key={group} className="glass-panel">
                <h3>{group}</h3>
                <ul>
                  {ALLOWED_EXERCISES.filter(
                    (t) => EXERCISE_META[t].group === group,
                  ).map((type) => (
                    <li key={type}>
                      <span>{EXERCISE_META[type].title}</span>
                      <input
                        type="checkbox"
                        checked={enabled.includes(type)}
                        onChange={() => toggle(type)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
        {sourceId ? (
          <AssignPanel
            sourceType={sourceType}
            sourceId={sourceId}
            exercises={enabled}
            students={students}
          />
        ) : (
          <section className="glass-panel lexicon-panel">
            <p className="empty-state">Выберите источник слов</p>
          </section>
        )}
      </div>
    </div>
  )
}
