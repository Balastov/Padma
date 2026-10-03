import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, Trash2 } from 'lucide-react'
import { api } from '../../../api'
import StubMedia from '../../../components/StubMedia'
import type { TeacherWord } from './DictionaryAllPage'
import { playWordAudio } from '../../../student/audio'
import './lexicon.css'

type Topic = { id: string; title: string }
type TopicDetail = {
  id: string
  subtopics: { id: string; title: string }[]
}

const empty = {
  word: '',
  transcription: '',
  translation: '',
  level: 'A2',
  pos: 'Существительное',
  shortMeaning: '',
  exampleEn: '',
  exampleRu: '',
  topicId: '',
  subtopicId: '',
}

export default function WordEditPage() {
  const { wordId } = useParams()
  const isNew = !wordId || wordId === 'new'
  const navigate = useNavigate()
  const [form, setForm] = useState(empty)
  const [topics, setTopics] = useState<Topic[]>([])
  const [subs, setSubs] = useState<{ id: string; title: string }[]>([])
  const [hasAudio, setHasAudio] = useState(false)
  const [tts, setTts] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<Topic[]>('/vocab/topics')
      .then(setTopics)
      .catch(() => setTopics([]))
  }, [])

  useEffect(() => {
    if (isNew) return
    api<TeacherWord>('/vocab/' + wordId)
      .then((w) => {
        setForm({
          word: w.word,
          transcription: w.transcription,
          translation: w.translation,
          level: w.level || 'A2',
          pos: w.pos || '',
          shortMeaning: w.shortMeaning || '',
          exampleEn: w.exampleEn || '',
          exampleRu: w.exampleRu || '',
          topicId: w.topicId || '',
          subtopicId: w.subtopicId || '',
        })
        setHasAudio(w.hasAudio)
      })
      .catch((e) => setError(e.message))
  }, [wordId, isNew])

  useEffect(() => {
    if (!form.topicId) {
      setSubs([])
      return
    }
    api<TopicDetail>('/vocab/topics/' + form.topicId)
      .then((d) => setSubs(d.subtopics))
      .catch(() => setSubs([]))
  }, [form.topicId])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function save(close: boolean) {
    setBusy(true)
    setError('')
    try {
      const payload = {
        ...form,
        topicId: form.topicId || null,
        subtopicId: form.subtopicId || null,
        tts: tts || undefined,
      }
      if (isNew) {
        const created = await api<TeacherWord>('/vocab', 'POST', payload)
        if (close) navigate('/teacher/lexicon/dictionary')
        else navigate('/teacher/lexicon/dictionary/words/' + created.id)
      } else {
        await api('/vocab/' + wordId, 'PATCH', payload)
        if (close) navigate('/teacher/lexicon/dictionary')
        else {
          setTts(false)
          const w = await api<TeacherWord>('/vocab/' + wordId)
          setHasAudio(w.hasAudio)
        }
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (isNew) return
    if (!confirm('Архивировать слово?')) return
    setBusy(true)
    try {
      await api('/vocab/' + wordId, 'DELETE', {})
      navigate('/teacher/lexicon/dictionary')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lexicon">
      <p className="lexicon-lead">
        Словарь · Все слова · {isNew ? 'Новое слово' : form.word || '…'}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="lexicon-grid-2">
        <section className="glass-panel lexicon-panel">
          <h2>{isNew ? 'Новое слово' : 'Редактирование слова'}</h2>
          <div className="lexicon-form">
            <label className="field">
              <span>Слово *</span>
              <input
                value={form.word}
                onChange={(e) => set('word', e.target.value)}
              />
            </label>
            <label className="field">
              <span>Перевод *</span>
              <input
                value={form.translation}
                onChange={(e) => set('translation', e.target.value)}
              />
            </label>
            <label className="field">
              <span>Транскрипция</span>
              <input
                value={form.transcription}
                onChange={(e) => set('transcription', e.target.value)}
              />
            </label>
            <label className="field">
              <span>Уровень</span>
              <select
                value={form.level}
                onChange={(e) => set('level', e.target.value)}
              >
                {['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => (
                  <option key={l || 'none'} value={l}>
                    {l || '—'}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Часть речи</span>
              <input
                value={form.pos}
                onChange={(e) => set('pos', e.target.value)}
                placeholder="Существительное"
              />
            </label>
            <label className="field">
              <span>Тема</span>
              <select
                value={form.topicId}
                onChange={(e) => {
                  set('topicId', e.target.value)
                  set('subtopicId', '')
                }}
              >
                <option value="">—</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Подтема</span>
              <select
                value={form.subtopicId}
                onChange={(e) => set('subtopicId', e.target.value)}
              >
                <option value="">—</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-full">
              <span>Краткое значение</span>
              <textarea
                rows={2}
                value={form.shortMeaning}
                onChange={(e) => set('shortMeaning', e.target.value)}
              />
            </label>
            <label className="field field-full">
              <span>Пример (EN)</span>
              <textarea
                rows={2}
                value={form.exampleEn}
                onChange={(e) => set('exampleEn', e.target.value)}
              />
            </label>
            <label className="field field-full">
              <span>Пример (RU)</span>
              <textarea
                rows={2}
                value={form.exampleRu}
                onChange={(e) => set('exampleRu', e.target.value)}
              />
            </label>
            <label className="field field-full" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={tts}
                onChange={(e) => setTts(e.target.checked)}
              />
              <span>
                Сгенерировать озвучку (OpenAI TTS)
                {hasAudio ? ' · сейчас есть аудио' : ''}
              </span>
            </label>
          </div>
          <div className="lexicon-toolbar">
            <button
              type="button"
              className="button-primary"
              disabled={busy}
              onClick={() => save(false)}
            >
              <Check size={18} /> Сохранить
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={busy}
              onClick={() => save(true)}
            >
              Сохранить и закрыть
            </button>
            {!isNew && (
              <button
                type="button"
                className="button-danger"
                disabled={busy}
                onClick={remove}
              >
                <Trash2 size={16} /> Архивировать
              </button>
            )}
            <Link className="text-button" to="/teacher/lexicon/dictionary">
              Отмена
            </Link>
          </div>
        </section>
        <section className="glass-panel lexicon-panel lexicon-preview">
          <h3>Как увидят ученики</h3>
          <StubMedia label={form.word || 'Слово'} />
          <div className="lexicon-preview__word">{form.word || '…'}</div>
          <p className="ipa">{form.transcription}</p>
          <p>{form.translation}</p>
          <div className="lexicon-toolbar">
            {form.level && <span className="pill">{form.level}</span>}
            {form.pos && <span className="pill">{form.pos}</span>}
          </div>
          {form.exampleEn && (
            <div>
              <small>Пример</small>
              <p>{form.exampleEn}</p>
              <p className="secondary">{form.exampleRu}</p>
            </div>
          )}
          {!isNew && (
            <button
              type="button"
              className="button-secondary button-small"
              onClick={() => void playWordAudio(form.word, wordId)}
            >
              Слушать
            </button>
          )}
        </section>
      </div>
    </div>
  )
}
