import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Play } from 'lucide-react'
import {
  ALLOWED_EXERCISES,
  EXERCISE_META,
  type ExerciseType,
} from '../../student/types'
import { useCatalog } from '../../student/useCatalog'
import {
  allowedExercisesFor,
  registerWords,
} from '../../student/catalogStore'
import {
  fetchSubtopic,
  fetchTopic,
  fetchTopics,
  toVocabWord,
} from '../../student/lexicon'
import type {
  StudentSubtopicWords,
  StudentTopic,
  StudentTopicDetail,
} from '../../student/lexicon'
import type { WordStatus } from '../../student/types'
import { loadCollections } from '../../student/collectionsStore'
import {
  createSession,
  getPausedSession,
} from '../../student/sessionStore'
import { revisitWords } from '../../student/progressStore'
import './TrainerPage.css'

// Words not yet mastered come first in a dictionary training.
const STATUS_ORDER: Record<WordStatus, number> = {
  learning: 0,
  reviewing: 1,
  new: 2,
  mastered: 3,
}

export default function TrainerHubPage() {
  const { catalog, loading, error } = useCatalog()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const initialSource =
    (params.get('source') as
      | 'all'
      | 'topic'
      | 'lesson'
      | 'collection'
      | 'revisit') || 'all'
  const [source, setSource] = useState(initialSource)
  // «Темы» use the textbook dictionary.
  const [topics, setTopics] = useState<StudentTopic[]>([])
  const [topicId, setTopicId] = useState('')
  const [topic, setTopic] = useState<StudentTopicDetail | null>(null)
  // A subtopic opened from the dictionary decides the topic itself.
  const requestedSub = initialSource === 'topic' ? params.get('id') || '' : ''
  const [subId, setSubId] = useState(requestedSub)
  const [sub, setSub] = useState<StudentSubtopicWords | null>(null)
  const [lessonId, setLessonId] = useState(params.get('id') || '')
  const [collectionId, setCollectionId] = useState(params.get('id') || '')
  const personal = loadCollections()
  const paused = getPausedSession()

  useEffect(() => {
    if (source !== 'topic' || topics.length) return
    let active = true
    fetchTopics()
      .then((list) => {
        if (!active) return
        setTopics(list)
        setTopicId((id) => id || (requestedSub ? '' : list[0]?.id || ''))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [source, topics.length, requestedSub])

  useEffect(() => {
    if (!topicId) return
    let active = true
    fetchTopic(topicId)
      .then((detail) => {
        if (!active) return
        setTopic(detail)
        setSubId((id) =>
          detail.subtopics.some((s) => s.id === id)
            ? id
            : detail.subtopics[0]?.id || '',
        )
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [topicId])

  useEffect(() => {
    if (!subId) return
    let active = true
    fetchSubtopic(subId)
      .then((data) => {
        if (!active) return
        registerWords(data.words.map((w) => toVocabWord(w, data.id)))
        setSub(data)
        setTopicId((id) => id || data.topicId)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [subId])

  useEffect(() => {
    if (!catalog) return
    if (!lessonId && catalog.lessons[0]) setLessonId(catalog.lessons[0].id)
    if (!collectionId) {
      const first = catalog.collections[0] || personal[0]
      if (first) setCollectionId(first.id)
    }
  }, [catalog, lessonId, collectionId, personal])

  const collections = useMemo(() => {
    const assigned = catalog?.collections || []
    const ids = new Set(assigned.map((c) => c.id))
    return [...assigned, ...personal.filter((c) => !ids.has(c.id))]
  }, [catalog, personal])

  const wordIds = useMemo(() => {
    if (!catalog) return []
    if (source === 'revisit') return revisitWords().map((w) => w.id)
    if (source === 'all') return catalog.words.map((w) => w.id)
    if (source === 'topic') {
      if (sub?.id !== subId) return []
      return [...sub.words]
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
        .map((w) => toVocabWord(w, sub.id).id)
    }
    if (source === 'lesson') {
      return catalog.lessons.find((l) => l.id === lessonId)?.wordIds || []
    }
    if (source === 'collection') {
      return collections.find((c) => c.id === collectionId)?.wordIds || []
    }
    return []
  }, [catalog, source, sub, subId, lessonId, collectionId, collections])

  const sourceLabel = useMemo(() => {
    if (!catalog) return ''
    if (source === 'revisit') return 'Слова для повторения'
    if (source === 'all') return 'Все слова'
    if (source === 'topic')
      return sub?.id === subId ? sub.title : 'Тема'
    if (source === 'lesson')
      return catalog.lessons.find((l) => l.id === lessonId)?.title || 'Урок'
    return collections.find((c) => c.id === collectionId)?.title || 'Коллекция'
  }, [catalog, source, sub, subId, lessonId, collectionId, collections])

  const unlocked = useMemo(() => {
    if (source === 'revisit' || source === 'all' || source === 'topic')
      return ALLOWED_EXERCISES
    const list = allowedExercisesFor(
      source,
      source === 'lesson' ? lessonId : collectionId,
    )
    if (!list) return ALLOWED_EXERCISES
    return ALLOWED_EXERCISES.filter((t) => list.includes(t))
  }, [source, lessonId, collectionId])

  const subs = topic?.id === topicId ? topic.subtopics : []
  const canStart = wordIds.length > 0 && (source !== 'topic' || Boolean(subId))

  function start(type: ExerciseType) {
    if (!canStart) return
    const session = createSession({
      sourceType: source === 'revisit' ? 'revisit' : source,
      sourceId:
        source === 'topic'
          ? subId
          : source === 'lesson'
            ? lessonId
            : source === 'collection'
              ? collectionId
              : 'all',
      sourceLabel,
      exerciseType: type,
      wordIds: wordIds.slice(0, 12),
      words:
        source === 'topic' && sub
          ? sub.words
              .map((w) => toVocabWord(w, sub.id))
              .filter((w) => wordIds.slice(0, 12).includes(w.id))
          : undefined,
    })
    navigate(`/words/trainer/session/${session.id}`)
  }

  const groups = ['Повторение', 'Понимание', 'Аудирование', 'Игровые форматы']

  if (loading) return <p role="status">Загружаем тренажёр…</p>
  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    )

  return (
    <div className="trainer-hub">
      <p className="dict-lead">
        Ваше пространство для практики слов. Учитесь в комфортном темпе.
      </p>
      {paused && (
        <section className="glass-panel trainer-resume">
          <div>
            <small>Незавершённая тренировка</small>
            <strong>
              {paused.sourceLabel} · {paused.currentIndex} из{' '}
              {paused.wordIds.length}
            </strong>
          </div>
          <Link
            className="button-primary"
            to={`/words/trainer/session/${paused.id}`}
          >
            <Play size={18} /> Продолжить
          </Link>
        </section>
      )}
      <div className="words-subtabs">
        {(
          [
            ['all', 'Все слова'],
            ['topic', 'Темы'],
            ['lesson', 'Слова уроков'],
            ['collection', 'Коллекции'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`words-chip${source === key ? ' is-active' : ''}`}
            onClick={() => setSource(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="trainer-filters glass-panel">
        {source === 'topic' && (
          <>
            <label className="field">
              <span>Тема</span>
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
            </label>
            <label className="field">
              <span>Подтема</span>
              <select value={subId} onChange={(e) => setSubId(e.target.value)}>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.termCount})
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {source === 'lesson' && (
          <label className="field">
            <span>Урок</span>
            <select
              value={lessonId}
              onChange={(e) => setLessonId(e.target.value)}
            >
              {(catalog?.lessons || []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {source === 'collection' && (
          <label className="field">
            <span>Коллекция</span>
            <select
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
            >
              <option value="">Выберите</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="caption">
          Набор: {sourceLabel} · {wordIds.length} слов
        </p>
      </div>
      <h2>Выберите формат тренировки</h2>
      <div className="trainer-formats">
        {groups.map((group) => (
          <section key={group} className="glass-panel trainer-group">
            <h3>{group}</h3>
            <ul>
              {ALLOWED_EXERCISES.filter(
                (t) => EXERCISE_META[t].group === group,
              ).map((type) => {
                const open = unlocked.includes(type)
                return (
                  <li key={type}>
                    <div>
                      <strong>{EXERCISE_META[type].title}</strong>
                      <small>
                        {open
                          ? EXERCISE_META[type].description
                          : 'Учитель пока не открыл этот формат'}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="button-primary button-small"
                      disabled={!canStart || !open}
                      onClick={() => start(type)}
                    >
                      <Play size={14} /> Начать
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
      {!canStart && (
        <p className="caption">
          Выберите конкретную подтему, урок или коллекцию со словами.
        </p>
      )}
    </div>
  )
}
