import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Play } from 'lucide-react'
import {
  ALLOWED_EXERCISES,
  EXERCISE_META,
  type ExerciseType,
} from '../../student/types'
import { seed } from '../../student/mock/seed'
import { loadCollections } from '../../student/collectionsStore'
import {
  createSession,
  getPausedSession,
} from '../../student/sessionStore'
import { revisitWords } from '../../student/progressStore'
import './TrainerPage.css'

export default function TrainerHubPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const initialSource =
    (params.get('source') as 'all' | 'topic' | 'lesson' | 'collection' | 'revisit') ||
    'all'
  const [source, setSource] = useState(initialSource)
  const [topicId, setTopicId] = useState('travel')
  const [subId, setSubId] = useState(params.get('id') || 'airport')
  const [lessonId, setLessonId] = useState(params.get('id') || 'vl-12')
  const [collectionId, setCollectionId] = useState(params.get('id') || '')
  const collections = loadCollections()
  const paused = getPausedSession()

  const wordIds = useMemo(() => {
    if (source === 'revisit') return revisitWords().map((w) => w.id)
    if (source === 'all') return seed.words.map((w) => w.id)
    if (source === 'topic') {
      const sub = seed.subtopics.find((s) => s.id === subId)
      return sub?.wordIds || []
    }
    if (source === 'lesson') {
      return seed.vocabLessons.find((l) => l.id === lessonId)?.wordIds || []
    }
    if (source === 'collection') {
      return collections.find((c) => c.id === collectionId)?.wordIds || []
    }
    return []
  }, [source, subId, lessonId, collectionId, collections])

  const sourceLabel = useMemo(() => {
    if (source === 'revisit') return 'Слова для повторения'
    if (source === 'all') return 'Все слова'
    if (source === 'topic')
      return seed.subtopics.find((s) => s.id === subId)?.title || 'Тема'
    if (source === 'lesson')
      return seed.vocabLessons.find((l) => l.id === lessonId)?.title || 'Урок'
    return collections.find((c) => c.id === collectionId)?.title || 'Коллекция'
  }, [source, subId, lessonId, collectionId, collections])

  const subs = seed.subtopics.filter((s) => s.topicId === topicId)
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
    })
    navigate(`/words/trainer/session/${session.id}`)
  }

  const groups = ['Повторение', 'Понимание', 'Аудирование', 'Игровые форматы']

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
                onChange={(e) => {
                  setTopicId(e.target.value)
                  const first = seed.subtopics.find(
                    (s) => s.topicId === e.target.value,
                  )
                  setSubId(first?.id || '')
                }}
              >
                {seed.topics
                  .filter((t) => t.kind === 'main')
                  .map((t) => (
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
                    {s.title} ({s.wordIds.length})
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
              {seed.vocabLessons.map((l) => (
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
              ).map((type) => (
                <li key={type}>
                  <div>
                    <strong>{EXERCISE_META[type].title}</strong>
                    <small>{EXERCISE_META[type].description}</small>
                  </div>
                  <button
                    type="button"
                    className="button-primary button-small"
                    disabled={!canStart}
                    onClick={() => start(type)}
                  >
                    <Play size={14} /> Начать
                  </button>
                </li>
              ))}
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
