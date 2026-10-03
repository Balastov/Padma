import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Play, Search } from 'lucide-react'
import {
  getWord,
  getWordsByIds,
  searchWords,
} from '../../student/catalogStore'
import { useCatalog } from '../../student/useCatalog'
import {
  getWordStatus,
  statusLabel,
} from '../../student/progressStore'
import {
  loadCollections,
  saveCollections,
} from '../../student/collectionsStore'
import type { VocabWord } from '../../student/types'
import { ExampleAudioButton, WordAudioButton } from './WordAudioButton'
import './DictionaryPage.css'

function WordCard({ word }: { word: VocabWord }) {
  return (
    <article className="glass-panel word-card">
      <div className="word-card__head">
        <div>
          <h2>{word.word}</h2>
          <p className="ipa">{word.transcription}</p>
          <p className="word-card__tr">{word.translation}</p>
        </div>
        <WordAudioButton word={word.word} vocabId={word.id} />
      </div>
      <div className="word-card__tags">
        {word.pos && (
          <span className="status-pill status-pill--learning">{word.pos}</span>
        )}
        {word.level && (
          <span className="status-pill status-pill--mastered">{word.level}</span>
        )}
      </div>
      {(word.exampleEn || word.exampleRu) && (
        <div className="word-card__example">
          <small>Пример</small>
          {word.exampleEn && (
            <p>
              {word.exampleEn} <ExampleAudioButton text={word.exampleEn} />
            </p>
          )}
          {word.exampleRu && <p className="secondary">{word.exampleRu}</p>}
        </div>
      )}
    </article>
  )
}

function CatalogGate({ children }: { children: ReactNode }) {
  const { catalog, error, loading } = useCatalog()
  if (loading) return <p role="status">Загружаем словарь…</p>
  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    )
  if (!catalog) return null
  return <>{children}</>
}

export default function DictionaryHub() {
  return (
    <div className="dict-page">
      <p className="dict-lead">
        Изучайте слова в контексте. Слушайте, повторяйте и сохраняйте в свой
        словарь.
      </p>
      <div className="words-subtabs">
        <NavLink to="/words/dictionary/topics">Темы</NavLink>
        <NavLink to="/words/dictionary/lessons">Слова уроков</NavLink>
        <NavLink to="/words/dictionary/collections">Коллекции</NavLink>
      </div>
      <CatalogGate>
        <GlobalSearch />
      </CatalogGate>
    </div>
  )
}

function GlobalSearch() {
  const { catalog } = useCatalog()
  const [q, setQ] = useState('')
  const found = useMemo(
    () => (q.trim() && catalog ? searchWords(q).slice(0, 12) : []),
    [q, catalog],
  )
  return (
    <div className="dict-search-block glass-panel">
      <div className="words-search">
        <label className="field" style={{ flex: 1, margin: 0 }}>
          <span className="sr-only">Поиск</span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Search size={18} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Найти слово, перевод или тему…"
            />
          </span>
        </label>
      </div>
      {q.trim() && (
        <ul className="dict-search-results">
          {found.map((w) => (
            <li key={w.id}>
              <Link to={`/words/word/${w.id}`}>
                <strong>{w.word}</strong>
                <span className="ipa">{w.transcription}</span>
                <small>{w.translation}</small>
              </Link>
              <WordAudioButton word={w.word} vocabId={w.id} />
            </li>
          ))}
          {!found.length && <li className="empty-state">Ничего не найдено</li>}
        </ul>
      )}
    </div>
  )
}

export function TopicsPage() {
  return (
    <CatalogGate>
      <TopicsPageInner />
    </CatalogGate>
  )
}

function TopicsPageInner() {
  const navigate = useNavigate()
  const { catalog } = useCatalog()
  const main = catalog!.topics.filter((t) => t.kind === 'main')
  const lexical = catalog!.topics.filter((t) => t.kind === 'lexical')
  return (
    <div className="dict-page">
      <DictionaryChrome />
      <div className="topics-split">
        <section className="glass-panel topics-list">
          <h2>Основные темы</h2>
          <ul>
            {main.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/words/dictionary/topics/${t.id}`)}
                >
                  <strong>{t.title}</strong>
                  <ChevronRight size={18} />
                </button>
              </li>
            ))}
            {!main.length && (
              <li className="empty-state">
                Пока нет назначенных тем. Учитель откроет их здесь.
              </li>
            )}
          </ul>
          <h2>Лексические группы</h2>
          <ul>
            {lexical.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/words/dictionary/topics/${t.id}`)}
                >
                  <strong>{t.title}</strong>
                  <ChevronRight size={18} />
                </button>
              </li>
            ))}
            {!lexical.length && (
              <li className="empty-state">Лексические группы появятся позже</li>
            )}
          </ul>
        </section>
        <section className="glass-panel topics-hint">
          <h2>Выберите тему</h2>
          <p>
            Откройте тему, затем подтему — и переходите к словам или тренажёру.
          </p>
        </section>
      </div>
    </div>
  )
}

export function TopicDetailPage() {
  return (
    <CatalogGate>
      <TopicDetailInner />
    </CatalogGate>
  )
}

function TopicDetailInner() {
  const { topicId } = useParams()
  const { catalog } = useCatalog()
  const topic = catalog!.topics.find((t) => t.id === topicId)
  if (!topic) return <p className="empty-state">Тема не найдена</p>
  const subs = catalog!.subtopics.filter((s) => s.topicId === topic.id)
  const total = subs.reduce((n, s) => n + s.wordIds.length, 0)
  return (
    <div className="dict-page">
      <DictionaryChrome crumbs={[topic.title]} />
      <div className="topics-split">
        <section className="glass-panel topic-hero">
          <h2>{topic.title}</h2>
          <p>{topic.description}</p>
          <p className="caption">
            {total} слов · {subs.length} подтем
          </p>
          <ul className="subtopic-list">
            {subs.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.title}</strong>
                  <small>{s.wordIds.length} слов</small>
                </div>
                <div className="subtopic-list__actions">
                  <Link
                    className="button-primary button-small"
                    to={`/words/dictionary/topics/${topic.id}/${s.id}`}
                  >
                    Открыть
                  </Link>
                  {s.wordIds.length > 0 && (
                    <Link
                      className="button-secondary button-small"
                      to={`/words/trainer?source=topic&id=${s.id}`}
                    >
                      <Play size={14} /> В тренажёр
                    </Link>
                  )}
                </div>
              </li>
            ))}
            {!subs.length && (
              <li className="empty-state">Подтемы скоро появятся</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  )
}

export function SubtopicWordsPage() {
  return (
    <CatalogGate>
      <SubtopicWordsInner />
    </CatalogGate>
  )
}

function SubtopicWordsInner() {
  const { topicId, subtopicId } = useParams()
  const { catalog } = useCatalog()
  const topic = catalog!.topics.find((t) => t.id === topicId)
  const sub = catalog!.subtopics.find((s) => s.id === subtopicId)
  const words = getWordsByIds(sub?.wordIds || [])
  const [selected, setSelected] = useState(words[0]?.id || '')
  useEffect(() => {
    if (!selected && words[0]) setSelected(words[0].id)
  }, [words, selected])
  const current = getWord(selected) || words[0]
  if (!topic || !sub) return <p className="empty-state">Подтема не найдена</p>
  return (
    <div className="dict-page">
      <DictionaryChrome crumbs={[topic.title, sub.title]} />
      <div className="words-triple">
        <section className="glass-panel words-col">
          <h2>Слова темы · {words.length}</h2>
          <ul className="word-rows">
            {words.map((w) => (
              <li
                key={w.id}
                className={w.id === current?.id ? 'is-active' : ''}
              >
                <button type="button" onClick={() => setSelected(w.id)}>
                  <strong>{w.word}</strong>
                  <span className="ipa">{w.transcription}</span>
                  <small>{w.translation}</small>
                </button>
                <WordAudioButton word={w.word} vocabId={w.id} />
              </li>
            ))}
          </ul>
        </section>
        {current && <WordCard word={current} />}
        <section className="glass-panel words-col">
          <h2>В этой подтеме</h2>
          <ul className="word-rows">
            {words
              .filter((w) => w.id !== current?.id)
              .slice(0, 8)
              .map((w) => (
                <li key={w.id}>
                  <button type="button" onClick={() => setSelected(w.id)}>
                    <strong>{w.word}</strong>
                    <span className="ipa">{w.transcription}</span>
                    <small>{w.translation}</small>
                  </button>
                  <WordAudioButton word={w.word} vocabId={w.id} />
                </li>
              ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

export function LessonsWordsPage() {
  return (
    <CatalogGate>
      <LessonsWordsInner />
    </CatalogGate>
  )
}

function LessonsWordsInner() {
  const { lessonId } = useParams()
  const { catalog } = useCatalog()
  const lessons = catalog!.lessons
  const active = lessons.find((l) => l.id === lessonId) || lessons[0]
  const words = getWordsByIds(active?.wordIds || [])
  const counts = {
    total: words.length,
    mastered: words.filter((w) => getWordStatus(w.id) === 'mastered').length,
    neu: words.filter((w) => getWordStatus(w.id) === 'new').length,
    reviewing: words.filter((w) => getWordStatus(w.id) === 'reviewing').length,
  }
  const pct = counts.total
    ? Math.round((counts.mastered / counts.total) * 100)
    : 0
  return (
    <div className="dict-page">
      <DictionaryChrome tab="lessons" />
      <div className="lessons-words">
        <section className="glass-panel words-col">
          <h2>Уроки · {lessons.length}</h2>
          <ul className="lesson-pick">
            {lessons.map((l) => (
              <li key={l.id}>
                <NavLink to={`/words/dictionary/lessons/${l.id}`}>
                  <strong>{l.title}</strong>
                  <small>
                    {l.date} · {l.wordIds.length} слов
                  </small>
                </NavLink>
              </li>
            ))}
            {!lessons.length && (
              <li className="empty-state">
                Слова появятся, когда учитель добавит их к вашим занятиям.
              </li>
            )}
          </ul>
        </section>
        {active && (
          <section className="glass-panel lesson-words-detail">
            <div className="lesson-words-detail__head">
              <div>
                <h2>{active.title}</h2>
                <p>{active.description || 'Слова к занятию'}</p>
              </div>
              <div className="progress-ring" aria-label={`${pct}%`}>
                <strong>{pct}%</strong>
              </div>
            </div>
            <div className="stat-tiles">
              <div>{counts.total} всего</div>
              <div>{counts.mastered} освоено</div>
              <div>{counts.neu} новых</div>
              <div>{counts.reviewing} закрепляется</div>
            </div>
            <table className="words-table">
              <thead>
                <tr>
                  <th>Слово</th>
                  <th>Перевод</th>
                  <th>Транскрипция</th>
                  <th></th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {words.map((w) => {
                  const st = getWordStatus(w.id)
                  return (
                    <tr key={w.id}>
                      <td>
                        <Link to={`/words/word/${w.id}`}>{w.word}</Link>
                      </td>
                      <td>{w.translation}</td>
                      <td className="ipa">{w.transcription}</td>
                      <td>
                        <WordAudioButton word={w.word} vocabId={w.id} />
                      </td>
                      <td>
                        <span className={`status-pill status-pill--${st}`}>
                          {statusLabel(st)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {words.length > 0 && (
              <Link
                className="button-primary"
                to={`/words/trainer?source=lesson&id=${active.id}`}
              >
                <Play size={18} /> В тренажёр
              </Link>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export function CollectionsPage() {
  return (
    <CatalogGate>
      <CollectionsInner />
    </CatalogGate>
  )
}

function CollectionsInner() {
  const { catalog } = useCatalog()
  const assigned = catalog!.collections
  const [personal, setPersonal] = useState(loadCollections)
  const [selected, setSelected] = useState(
    assigned[0]?.id || personal[0]?.id || '',
  )
  const [title, setTitle] = useState('')
  const current =
    assigned.find((c) => c.id === selected) ||
    personal.find((c) => c.id === selected) ||
    assigned[0] ||
    personal[0]
  const isPersonal = current
    ? personal.some((c) => c.id === current.id)
    : false

  function create() {
    if (!title.trim()) return
    const next = [
      ...personal,
      {
        id: crypto.randomUUID(),
        title: title.trim(),
        description: 'Ваша коллекция',
        wordIds: [] as string[],
        tags: [] as string[],
        updated: new Date().toISOString().slice(0, 10),
      },
    ]
    setPersonal(next)
    saveCollections(next)
    setTitle('')
  }
  function remove(id: string) {
    const next = personal.filter((c) => c.id !== id)
    setPersonal(next)
    saveCollections(next)
    setSelected(assigned[0]?.id || next[0]?.id || '')
  }

  return (
    <div className="dict-page">
      <DictionaryChrome tab="collections" />
      <div className="collections-layout">
        <section className="collections-grid">
          {assigned.map((c) => (
            <article
              key={c.id}
              className={
                'glass-panel collection-card' +
                (c.id === current?.id ? ' is-active' : '')
              }
            >
              <button
                type="button"
                className="collection-card__main"
                onClick={() => setSelected(c.id)}
              >
                <strong>{c.title}</strong>
                <p>{c.description}</p>
                <small>
                  {c.wordIds.length} слов · от учителя
                </small>
              </button>
              <div className="collection-card__actions">
                <Link
                  className="button-secondary button-small"
                  to={`/words/dictionary/collections/${c.id}`}
                >
                  Открыть
                </Link>
                <Link
                  className="button-secondary button-small"
                  to={`/words/trainer?source=collection&id=${c.id}`}
                >
                  В тренировку
                </Link>
              </div>
            </article>
          ))}
          {personal.map((c) => (
            <article
              key={c.id}
              className={
                'glass-panel collection-card' +
                (c.id === current?.id ? ' is-active' : '')
              }
            >
              <button
                type="button"
                className="collection-card__main"
                onClick={() => setSelected(c.id)}
              >
                <strong>{c.title}</strong>
                <p>{c.description}</p>
                <small>
                  {c.wordIds.length} слов · {c.updated}
                </small>
              </button>
              <div className="collection-card__actions">
                <Link
                  className="button-secondary button-small"
                  to={`/words/dictionary/collections/${c.id}`}
                >
                  Открыть
                </Link>
              </div>
            </article>
          ))}
          <div className="glass-panel collection-new">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Новая личная коллекция"
            />
            <button
              type="button"
              className="button-primary button-small"
              onClick={create}
            >
              Создать
            </button>
          </div>
        </section>
        {current && (
          <aside className="glass-panel collection-detail">
            <h2>{current.title}</h2>
            <p>{current.description}</p>
            <p className="caption">{current.wordIds.length} слов</p>
            <ul className="word-rows">
              {getWordsByIds(current.wordIds).map((w) => (
                <li key={w.id}>
                  <div>
                    <strong>{w.word}</strong>
                    <small>{w.translation}</small>
                  </div>
                  <WordAudioButton word={w.word} vocabId={w.id} />
                </li>
              ))}
            </ul>
            {isPersonal && (
              <button
                type="button"
                className="text-button"
                onClick={() => remove(current.id)}
              >
                Удалить коллекцию
              </button>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}

export function CollectionDetailPage() {
  return (
    <CatalogGate>
      <CollectionDetailInner />
    </CatalogGate>
  )
}

function CollectionDetailInner() {
  const { collectionId } = useParams()
  const { catalog } = useCatalog()
  const c =
    catalog!.collections.find((x) => x.id === collectionId) ||
    loadCollections().find((x) => x.id === collectionId)
  if (!c) return <p className="empty-state">Коллекция не найдена</p>
  return (
    <div className="dict-page">
      <DictionaryChrome tab="collections" crumbs={[c.title]} />
      <section className="glass-panel lesson-words-detail">
        <h2>{c.title}</h2>
        <p>{c.description}</p>
        <table className="words-table">
          <thead>
            <tr>
              <th>Слово</th>
              <th>Перевод</th>
              <th>IPA</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {getWordsByIds(c.wordIds).map((w) => (
              <tr key={w.id}>
                <td>{w.word}</td>
                <td>{w.translation}</td>
                <td className="ipa">{w.transcription}</td>
                <td>
                  <WordAudioButton word={w.word} vocabId={w.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export function WordDeepLinkPage() {
  return (
    <CatalogGate>
      <WordDeepLinkInner />
    </CatalogGate>
  )
}

function WordDeepLinkInner() {
  const { wordId } = useParams()
  const word = getWord(wordId || '')
  if (!word) return <p className="empty-state">Слово не найдено</p>
  return (
    <div className="dict-page">
      <DictionaryChrome />
      <div className="words-triple">
        <WordCard word={word} />
      </div>
    </div>
  )
}

function DictionaryChrome({
  tab = 'topics',
  crumbs = [],
}: {
  tab?: 'topics' | 'lessons' | 'collections'
  crumbs?: string[]
}) {
  return (
    <>
      <p className="dict-lead">
        Изучайте слова в контексте. Слушайте, повторяйте и сохраняйте в свой
        словарь.
      </p>
      <div className="words-subtabs">
        <NavLink to="/words/dictionary/topics">Темы</NavLink>
        <NavLink to="/words/dictionary/lessons">Слова уроков</NavLink>
        <NavLink to="/words/dictionary/collections">Коллекции</NavLink>
      </div>
      <div className="dict-crumbs">
        <span>Словарь</span>
        <span>·</span>
        <span>
          {tab === 'topics'
            ? 'Темы'
            : tab === 'lessons'
              ? 'Слова уроков'
              : 'Коллекции'}
        </span>
        {crumbs.map((c) => (
          <span key={c}>
            <span>·</span> {c}
          </span>
        ))}
      </div>
      <GlobalSearch />
    </>
  )
}
