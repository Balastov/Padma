import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Search, X } from 'lucide-react'
import { api } from '../../../api'
import { MAX_FILES, uploadAll } from '../../../files'
import { FileLinks, FilePicker } from '../../../components/Attachments'
import HomeworkLexicon from '../../../components/HomeworkLexicon'
import type { LexiconSource } from '../../../components/HomeworkLexicon'
import { LinkTextarea } from '../../../components/RichText'
import type { PlanStep } from './planTypes'
import './plans.css'

type StepView = PlanStep & {
  plan: { id: string; title: string; studentId: string | null; canEdit: boolean }
  block: string
}
type Grammar = { id: string; title: string; description: string }

const toSources = (step: PlanStep): LexiconSource[] =>
  step.lexicon.map((s) => ({
    key: s.kind === 'search' ? 'search' : `${s.kind}:${s.id}`,
    kind: s.kind,
    id: s.id || undefined,
    title: s.title,
    parentTitle: s.parentTitle || undefined,
    terms: s.words,
    checked: s.words.map((w) => w.id),
  }))

/** One lesson of a plan: only the title is required. */
export default function PlanLessonPage() {
  const { id = '', lessonId = '' } = useParams()
  const navigate = useNavigate()
  const [step, setStep] = useState<StepView | null>(null)
  const [title, setTitle] = useState('')
  const [homework, setHomework] = useState('')
  const [lexicon, setLexicon] = useState<LexiconSource[]>([])
  const [grammarIds, setGrammarIds] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [removeFileIds, setRemoveFileIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    api<StepView>(`/plan-lessons/${lessonId}`)
      .then((data) => {
        if (!active) return
        setStep(data)
        setTitle(data.title)
        setHomework(data.homework)
        setLexicon(toSources(data))
        setGrammarIds(data.grammar.map((g) => g.id))
      })
      .catch((e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [lessonId])

  const back = `/teacher/plans/${id}`
  if (!step)
    return (
      <div className="plans">
        <Link className="plans-back" to={back}>
          <ArrowLeft size={16} aria-hidden="true" /> К плану
        </Link>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <p role="status">Загружаем урок…</p>
        )}
      </div>
    )

  const kept = step.files.filter((f) => !removeFileIds.includes(f.id))
  const edit = step.plan.canEdit

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const fileIds = await uploadAll(files)
      await api(`/plan-lessons/${lessonId}`, 'PUT', {
        title,
        homework,
        lexicon: lexicon.map((s) => ({
          kind: s.kind,
          id: s.id,
          termIds: s.checked,
        })),
        grammarIds,
        fileIds,
        removeFileIds,
      })
      navigate(back)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="plans">
      <Link className="plans-back" to={back}>
        <ArrowLeft size={16} aria-hidden="true" /> {step.plan.title}
      </Link>
      <form className="glass-panel plans-lesson form-stack" onSubmit={save}>
        <p className="eyebrow">
          {step.block} · УРОК {step.number}
        </p>
        {step.issue && (
          <p className="notice">
            {step.issue.homeworkId
              ? 'Задание по этому уроку уже выдано ученику — изменения его не затронут.'
              : 'Этот урок плана уже пройден.'}
          </p>
        )}
        <fieldset className="plans-lesson__fields" disabled={!edit}>
          <label className="field">
            <span>Название урока *</span>
            <input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <p className="caption">
            Остальные графы необязательны. Всё, что заполнено, ученик получит
            домашним заданием после этого урока.
          </p>

          <section className="plans-lesson__part">
            <h2>Домашнее задание</h2>
            <LinkTextarea
              label="Задание словами"
              value={homework}
              onChange={setHomework}
              placeholder="Что сделать к следующему уроку. Выделите слово и нажмите «Ссылка на слово», чтобы добавить ссылку."
            />
            <div className="plans-lesson__files">
              <span>Файлы</span>
              {!!kept.length && (
                <ul className="attach__chips">
                  {kept.map((f) => (
                    <li key={f.id}>
                      <FileText size={15} aria-hidden="true" />
                      <span>{f.name}</span>
                      <button
                        type="button"
                        aria-label={`Убрать ${f.name}`}
                        onClick={() => setRemoveFileIds([...removeFileIds, f.id])}
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <FilePicker
                files={files}
                onChange={setFiles}
                max={MAX_FILES - kept.length}
                disabled={busy || !edit}
                label="Добавить файл"
              />
              {!edit && <FileLinks files={step.files} />}
            </div>
          </section>

          <section className="plans-lesson__part">
            <h2>Лексика из Словаря</h2>
            <p className="caption">
              Можно добавить сколько угодно наборов: темы, подтемы и слова из
              поиска.
            </p>
            <HomeworkLexicon value={lexicon} onChange={setLexicon} />
          </section>

          <section className="plans-lesson__part">
            <h2>Грамматика из Библиотеки</h2>
            <GrammarPicker value={grammarIds} onChange={setGrammarIds} />
          </section>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          {edit && (
            <button className="button-primary" disabled={busy}>
              {busy ? 'Сохраняем…' : 'Сохранить урок'}
            </button>
          )}
          <Link className="button-secondary" to={back}>
            {edit ? 'Отмена' : 'Назад'}
          </Link>
        </div>
      </form>
    </div>
  )
}

function GrammarPicker({
  value,
  onChange,
}: {
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const [items, setItems] = useState<Grammar[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    api<Grammar[]>('/plans/grammar')
      .then(setItems)
      .catch((e: Error) => setError(e.message))
  }, [])
  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    )
  if (!items) return <p className="caption">Загружаем грамматику…</p>
  if (!items.length)
    return (
      <p className="caption">
        В Библиотеке пока нет грамматики. Добавьте материал в раздел
        «Грамматика» на странице <Link to="/teacher/library">Библиотека</Link>.
      </p>
    )
  const needle = query.trim().toLocaleLowerCase('ru')
  const shown = needle
    ? items.filter((g) => g.title.toLocaleLowerCase('ru').includes(needle))
    : items
  const chosen = items.filter((g) => value.includes(g.id))
  return (
    <div className="plans-grammar">
      {!!chosen.length && (
        <ul className="attach__chips">
          {chosen.map((g) => (
            <li key={g.id}>
              <span>{g.title}</span>
              <button
                type="button"
                aria-label={`Убрать ${g.title}`}
                onClick={() => onChange(value.filter((x) => x !== g.id))}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {items.length > 6 && (
        <label className="lex-search__field">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Поиск грамматики</span>
          <input
            value={query}
            placeholder="Поиск по названию"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      <ul className="plans-grammar__list">
        {shown.map((g) => (
          <li key={g.id}>
            <label>
              <input
                type="checkbox"
                checked={value.includes(g.id)}
                onChange={() =>
                  onChange(
                    value.includes(g.id)
                      ? value.filter((x) => x !== g.id)
                      : [...value, g.id],
                  )
                }
              />
              <span>
                <strong>{g.title}</strong>
                {g.description && <small>{g.description}</small>}
              </span>
            </label>
          </li>
        ))}
        {!shown.length && <li className="caption">Ничего не найдено.</li>}
      </ul>
    </div>
  )
}
