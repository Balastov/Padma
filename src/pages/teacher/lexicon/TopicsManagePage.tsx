import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { api } from '../../../api'
import type { User } from '../../../api'
import StubMedia from '../../../components/StubMedia'
import AssignPanel from './AssignPanel'
import { DictionaryChrome } from './DictionaryAllPage'
import './lexicon.css'

type Topic = {
  id: string
  title: string
  description: string
  kind: string
  wordCount: number
  lexiconWordCount: number
  subtopicCount: number
}
type Subtopic = {
  id: string
  topicId: string
  title: string
  description: string
  wordCount: number
}

const titleKey = (value: string) =>
  value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru')
const wordsLabel = (t: Topic) => `${t.lexiconWordCount + t.wordCount} слов`

export default function TopicsManagePage({ students }: { students: User[] }) {
  const [topics, setTopics] = useState<Topic[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState<{
    subtopics: Subtopic[]
  } | null>(null)
  const [subId, setSubId] = useState('')
  const [title, setTitle] = useState('')
  const [subTitle, setSubTitle] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const list = await api<Topic[]>('/vocab/topics')
      setTopics(list)
      if (!selectedId && list[0]) setSelectedId(list[0].id)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [selectedId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selectedId) return
    api<{ subtopics: Subtopic[] }>('/vocab/topics/' + selectedId)
      .then((d) => {
        setDetail(d)
        if (!subId && d.subtopics[0]) setSubId(d.subtopics[0].id)
      })
      .catch((e) => setError(e.message))
  }, [selectedId, subId])

  const topic = topics.find((t) => t.id === selectedId)
  const sub = detail?.subtopics.find((s) => s.id === subId)
  const main = topics.filter((t) => t.kind === 'main')
  const lexical = topics.filter((t) => t.kind === 'lexical')
  const topicExists =
    !!title.trim() && topics.some((t) => titleKey(t.title) === titleKey(title))
  const subExists =
    !!subTitle.trim() &&
    !!detail?.subtopics.some((s) => titleKey(s.title) === titleKey(subTitle))

  async function addTopic(kind: 'main' | 'lexical') {
    if (!title.trim() || topicExists) return
    try {
      const t = await api<Topic>('/vocab/topics', 'POST', {
        title: title.trim(),
        kind,
        description: '',
      })
      setTitle('')
      setError('')
      await load()
      setSelectedId(t.id)
      setSubId('')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function addSub() {
    if (!selectedId || !subTitle.trim() || subExists) return
    try {
      await api('/vocab/topics/' + selectedId + '/subtopics', 'POST', {
        title: subTitle.trim(),
      })
      setSubTitle('')
      setError('')
      const d = await api<{ subtopics: Subtopic[] }>(
        '/vocab/topics/' + selectedId,
      )
      setDetail(d)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="lexicon">
      <DictionaryChrome lead="Продумайте структуру, в которой ученикам легко ориентироваться." />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="lexicon-grid-3">
        <section className="glass-panel lexicon-panel">
          <div className="lexicon-toolbar">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Новая тема"
              aria-invalid={topicExists}
            />
          </div>
          {topicExists && (
            <p className="caption lexicon-duplicate" role="status">
              Такая тема уже есть
            </p>
          )}
          <div className="lexicon-toolbar">
            <button
              type="button"
              className="button-primary button-small"
              disabled={!title.trim() || topicExists}
              onClick={() => addTopic('main')}
            >
              <Plus size={14} /> Тема
            </button>
            <button
              type="button"
              className="button-secondary button-small"
              disabled={!title.trim() || topicExists}
              onClick={() => addTopic('lexical')}
            >
              Группа
            </button>
          </div>
          <h2>Основные темы</h2>
          <ul className="lexicon-list lexicon-topic-list">
            {main.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={t.id === selectedId ? 'is-active' : ''}
                  onClick={() => {
                    setSelectedId(t.id)
                    setSubId('')
                  }}
                >
                  <span>
                    <strong>{t.title}</strong>
                    <small style={{ display: 'block' }}>
                      {wordsLabel(t)}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              </li>
            ))}
          </ul>
          <h2>Лексические группы</h2>
          <ul className="lexicon-list lexicon-topic-list">
            {lexical.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={t.id === selectedId ? 'is-active' : ''}
                  onClick={() => {
                    setSelectedId(t.id)
                    setSubId('')
                  }}
                >
                  <span>
                    <strong>{t.title}</strong>
                    <small style={{ display: 'block' }}>
                      {wordsLabel(t)}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass-panel lexicon-panel">
          {topic ? (
            <>
              <StubMedia label={topic.title} tall />
              <h2>{topic.title}</h2>
              <p className="caption">
                {wordsLabel(topic)}
                {topic.lexiconWordCount > 0 &&
                  topic.wordCount > 0 &&
                  ` (из учебников: ${topic.lexiconWordCount})`}{' '}
                · {detail?.subtopics.length ?? topic.subtopicCount} подтем
                <span className="pill" style={{ marginLeft: 8 }}>
                  прогресс: заглушка
                </span>
              </p>
              <ul className="lexicon-list">
                {(detail?.subtopics || []).map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={s.id === subId ? 'is-active' : ''}
                      onClick={() => setSubId(s.id)}
                    >
                      <span>
                        <strong>{s.title}</strong>
                        <small style={{ display: 'block' }}>
                          {s.wordCount} слов
                        </small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="lexicon-toolbar">
                <input
                  value={subTitle}
                  onChange={(e) => setSubTitle(e.target.value)}
                  placeholder="Новая подтема"
                  aria-invalid={subExists}
                />
                <button
                  type="button"
                  className="button-primary button-small"
                  disabled={!subTitle.trim() || subExists}
                  onClick={addSub}
                >
                  <Plus size={14} /> Добавить
                </button>
              </div>
              {subExists && (
                <p className="caption lexicon-duplicate" role="status">
                  Такая подтема в этой теме уже есть
                </p>
              )}
            </>
          ) : (
            <p className="empty-state">Выберите тему слева</p>
          )}
        </section>

        {sub ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <section className="glass-panel lexicon-panel">
              <StubMedia label={sub.title} />
              <h3>{sub.title}</h3>
              <p>{sub.description || 'Подтема словаря'}</p>
              <p className="caption">{sub.wordCount} слов</p>
            </section>
            <AssignPanel
              sourceType="subtopic"
              sourceId={sub.id}
              students={students}
            />
          </div>
        ) : topic ? (
          <AssignPanel
            sourceType="topic"
            sourceId={topic.id}
            students={students}
          />
        ) : (
          <section className="glass-panel lexicon-panel">
            <p className="empty-state">Выберите тему или подтему</p>
          </section>
        )}
      </div>
    </div>
  )
}
