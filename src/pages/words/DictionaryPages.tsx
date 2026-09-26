import { useMemo, useState } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Play, Search } from 'lucide-react'
import { seed, getWord, getWordsByIds, searchWords } from '../../student/mock/seed'
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
        <WordAudioButton word={word.word} />
      </div>
      <div className="word-card__tags">
        <span className="status-pill status-pill--learning">{word.pos}</span>
        <span className="status-pill status-pill--mastered">{word.level}</span>
      </div>
      <div className="word-card__example">
        <small>Пример</small>
        <p>
          {word.exampleEn} <ExampleAudioButton text={word.exampleEn} />
        </p>
        <p className="secondary">{word.exampleRu}</p>
      </div>
    </article>
  )
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
      <GlobalSearch />
    </div>
  )
}

function GlobalSearch() {
  const [q, setQ] = useState('')
  const found = useMemo(() => (q.trim() ? searchWords(q).slice(0, 12) : []), [q])
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
              <WordAudioButton word={w.word} />
            </li>
          ))}
          {!found.length && <li className="empty-state">Ничего не найдено</li>}
        </ul>
      )}
    </div>
  )
}

export function TopicsPage() {
  const navigate = useNavigate()
  const main = seed.topics.filter((t) => t.kind === 'main')
  const lexical = seed.topics.filter((t) => t.kind === 'lexical')
  return (
    <div className="dict-page">
      <DictionaryChrome />
      <div className="topics-split">
        <section className="glass-panel topics-list">
          <h2>Основные темы</h2>
          <ul>
            {main.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => navigate(`/words/dictionary/topics/${t.id}`)}>
                  <strong>{t.title}</strong>
                  <ChevronRight size={18} />
                </button>
              </li>
            ))}
          </ul>
          <h2>Лексические группы</h2>
          <ul>
            {lexical.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => navigate(`/words/dictionary/topics/${t.id}`)}>
                  <strong>{t.title}</strong>
                  <ChevronRight size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="glass-panel topics-hint">
          <h2>Выберите тему</h2>
          <p>Откройте тему, затем подтему — и переходите к словам или тренажёру.</p>
        </section>
      </div>
    </div>
  )
}

export function TopicDetailPage() {
  const { topicId } = useParams()
  const topic = seed.topics.find((t) => t.id === topicId)
  if (!topic) return <p className="empty-state">Тема не найдена</p>
  const subs = seed.subtopics.filter((s) => s.topicId === topic.id)
  const total = subs.reduce((n, s) => n + s.wordIds.length, 0)
  return (
    <div className="dict-page">
      <DictionaryChrome crumbs={[topic.title]} />
      <div className="topics-split">
        <section className="glass-panel topic-hero">
          <h2>{topic.title}</h2>
          <p>{topic.description}</p>
          <p className="caption">{total} слов · {subs.length} подтем</p>
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
  const { topicId, subtopicId } = useParams()
  const topic = seed.topics.find((t) => t.id === topicId)
  const sub = seed.subtopics.find((s) => s.id === subtopicId)
  const words = getWordsByIds(sub?.wordIds || [])
  const [selected, setSelected] = useState(words[0]?.id || '')
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
              <li key={w.id} className={w.id === current?.id ? 'is-active' : ''}>
                <button type="button" onClick={() => setSelected(w.id)}>
                  <strong>{w.word}</strong>
                  <span className="ipa">{w.transcription}</span>
                  <small>{w.translation}</small>
                </button>
                <WordAudioButton word={w.word} />
              </li>
            ))}
          </ul>
        </section>
        {current && <WordCard word={current} />}
        <section className="glass-panel words-col">
          <h2>Похожие слова</h2>
          <ul className="word-rows">
            {getWordsByIds(current?.relatedIds || []).map((w) => (
              <li key={w.id}>
                <button type="button" onClick={() => setSelected(w.id)}>
                  <strong>{w.word}</strong>
                  <span className="ipa">{w.transcription}</span>
                  <small>{w.translation}</small>
                </button>
                <WordAudioButton word={w.word} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

export function LessonsWordsPage() {
  const { lessonId } = useParams()
  const lessons = seed.vocabLessons
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
          <h2>Уроки курса · {lessons.length}</h2>
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
          </ul>
        </section>
        {active && (
          <section className="glass-panel lesson-words-detail">
            <div className="lesson-words-detail__head">
              <div>
                <h2>{active.title}</h2>
                <p>{active.description}</p>
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
                        <WordAudioButton word={w.word} />
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
            <Link
              className="button-primary"
              to={`/words/trainer?source=lesson&id=${active.id}`}
            >
              <Play size={18} /> В тренажёр
            </Link>
          </section>
        )}
      </div>
    </div>
  )
}

export function CollectionsPage() {
  const [list, setList] = useState(loadCollections)
  const [selected, setSelected] = useState(list[0]?.id || '')
  const [title, setTitle] = useState('')
  const current = list.find((c) => c.id === selected) || list[0]
  function create() {
    if (!title.trim()) return
    const next = [
      ...list,
      {
        id: crypto.randomUUID(),
        title: title.trim(),
        description: 'Ваша коллекция',
        wordIds: [],
        tags: [],
        updated: new Date().toISOString().slice(0, 10),
      },
    ]
    setList(next)
    saveCollections(next)
    setTitle('')
  }
  function remove(id: string) {
    const next = list.filter((c) => c.id !== id)
    setList(next)
    saveCollections(next)
    setSelected(next[0]?.id || '')
  }
  return (
    <div className="dict-page">
      <DictionaryChrome tab="collections" />
      <div className="collections-layout">
        <section className="collections-grid">
          {list.map((c) => (
            <article
              key={c.id}
              className={`glass-panel collection-card${c.id === current?.id ? ' is-active' : ''}`}
            >
              <button type="button" className="collection-card__main" onClick={() => setSelected(c.id)}>
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
                <Link
                  className="button-secondary button-small"
                  to={`/words/trainer?source=collection&id=${c.id}`}
                >
                  В тренировку
                </Link>
              </div>
            </article>
          ))}
          <div className="glass-panel collection-new">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Новая коллекция"
            />
            <button type="button" className="button-primary button-small" onClick={create}>
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
                  <WordAudioButton word={w.word} />
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="text-button"
              onClick={() => remove(current.id)}
            >
              Удалить коллекцию
            </button>
          </aside>
        )}
      </div>
    </div>
  )
}

export function CollectionDetailPage() {
  const { collectionId } = useParams()
  const list = loadCollections()
  const c = list.find((x) => x.id === collectionId)
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
                  <WordAudioButton word={w.word} />
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
  const { wordId } = useParams()
  const word = getWord(wordId || '')
  if (!word) return <p className="empty-state">Слово не найдено</p>
  return (
    <div className="dict-page">
      <DictionaryChrome />
      <div className="words-triple">
        <WordCard word={word} />
        <section className="glass-panel words-col">
          <h2>Связанные</h2>
          <ul className="word-rows">
            {getWordsByIds(word.relatedIds).map((w) => (
              <li key={w.id}>
                <Link to={`/words/word/${w.id}`}>
                  <strong>{w.word}</strong>
                  <span className="ipa">{w.transcription}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
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
