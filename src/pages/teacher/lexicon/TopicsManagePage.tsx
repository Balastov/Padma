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
  subtopicCount: number
}
type Subtopic = {
  id: string
  topicId: string
  title: string
  description: string
  wordCount: number
}

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

  async function addTopic(kind: 'main' | 'lexical') {
    if (!title.trim()) return
    try {
      const t = await api<Topic>('/vocab/topics', 'POST', {
        title: title.trim(),
        kind,
        description: '',
      })
      setTitle('')
      await load()
      setSelectedId(t.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function addSub() {
    if (!selectedId || !subTitle.trim()) return
    try {
      await api('/vocab/topics/' + selectedId + '/subtopics', 'POST', {
        title: subTitle.trim(),
      })
      setSubTitle('')
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
          <h2>Основные темы</h2>
          <ul className="lexicon-list">
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
                      {t.wordCount} слов
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              </li>
            ))}
          </ul>
          <h2>Лексические группы</h2>
          <ul className="lexicon-list">
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
                  </span>
                  <ChevronRight size={16} />
                </button>
              </li>
            ))}
          </ul>
          <div className="lexicon-toolbar">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Новая тема"
            />
          </div>
          <div className="lexicon-toolbar">
            <button
              type="button"
              className="button-primary button-small"
              onClick={() => addTopic('main')}
            >
              <Plus size={14} /> Тема
            </button>
            <button
              type="button"
              className="button-secondary button-small"
              onClick={() => addTopic('lexical')}
            >
              Группа
            </button>
          </div>
        </section>

        <section className="glass-panel lexicon-panel">
          {topic ? (
            <>
              <StubMedia label={topic.title} tall />
              <h2>{topic.title}</h2>
              <p className="caption">
                {topic.wordCount} слов · {topic.subtopicCount} подтем
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
                />
                <button
                  type="button"
                  className="button-primary button-small"
                  onClick={addSub}
                >
                  <Plus size={14} /> Добавить
                </button>
              </div>
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
