import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown, ClipboardList, Layers, Play, X } from 'lucide-react'
import {
  ALLOWED_EXERCISES,
  EXERCISE_META,
  type ExerciseType,
  type VocabWord,
  type WordStatus,
} from '../../student/types'
import { useCatalog } from '../../student/useCatalog'
import { getWordsByIds, registerWords } from '../../student/catalogStore'
import { loadCollections } from '../../student/collectionsStore'
import { createSession } from '../../student/sessionStore'
import {
  fetchHomeworkSets,
  fetchHomeworkWords,
  fetchSubtopic,
  toVocabWord,
} from '../../student/lexicon'
import type { HomeworkSet, StudentWord } from '../../student/lexicon'
import { friendlyDate } from '../../api'
import { wordsCount } from '../../components/lexiconFormat'
import './TrainerPage.css'

const SESSION_SIZE = 12
// Words not yet mastered come first in a dictionary training.
const STATUS_ORDER: Record<WordStatus, number> = {
  learning: 0,
  reviewing: 1,
  new: 2,
  mastered: 3,
}
const HW_STATUS = { todo: 'К выполнению', returned: 'Нужна доработка' }

type Picked = {
  kind: 'homework' | 'collection' | 'topic'
  id: string
}
type WordSet = {
  key: string
  title: string
  words: VocabWord[]
  lexicon: boolean
}

const ordered = (words: StudentWord[], setId: string) =>
  [...words]
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
    .map((w) => toVocabWord(w, setId))

function pickedFrom(params: URLSearchParams): Picked | null {
  const id = params.get('id')
  const source = params.get('source')
  if (!id) return null
  if (source === 'topic' || source === 'homework' || source === 'collection')
    return { kind: source, id }
  return null
}

export default function TrainerHubPage() {
  const { catalog } = useCatalog()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [picked, setPicked] = useState<Picked | null>(() => pickedFrom(params))
  const [open, setOpen] = useState<'' | 'homework' | 'collection'>('')
  const [homework, setHomework] = useState<HomeworkSet[] | null>(null)
  const [set, setSet] = useState<WordSet | null>(null)
  const [error, setError] = useState('')
  const pickers = useRef<HTMLDivElement>(null)
  const collections = loadCollections()

  useEffect(() => {
    let active = true
    fetchHomeworkSets()
      .then((list) => active && setHomework(list))
      .catch(() => active && setHomework([]))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!pickers.current?.contains(e.target as Node)) setOpen('')
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen('')
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Dictionary words of the picked homework or subtopic.
  const pickedKind = picked?.kind
  const pickedId = picked?.id
  const pickedKey = picked ? `${picked.kind}:${picked.id}` : ''
  useEffect(() => {
    if (!pickedId || pickedKind === 'collection') return
    let active = true
    const load =
      pickedKind === 'homework'
        ? fetchHomeworkWords(pickedId)
        : fetchSubtopic(pickedId)
    load
      .then((data) => {
        if (!active) return
        const words = ordered(data.words, data.id)
        registerWords(words)
        setSet({
          key: `${pickedKind}:${pickedId}`,
          title: data.title,
          words,
          lexicon: true,
        })
        setError('')
      })
      .catch((e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [pickedKind, pickedId])

  const collection =
    pickedKind === 'collection'
      ? collections.find((c) => c.id === pickedId)
      : undefined
  const current: WordSet | null =
    pickedKind === 'collection'
      ? collection && catalog
        ? {
            key: pickedKey,
            title: collection.title,
            words: getWordsByIds(collection.wordIds),
            lexicon: false,
          }
        : null
      : set?.key === pickedKey
        ? set
        : null
  const sessionWords = current?.words.slice(0, SESSION_SIZE) || []

  function choose(next: Picked) {
    setPicked(next)
    setOpen('')
  }

  function start(type: ExerciseType) {
    if (!current || !picked || !sessionWords.length) return
    const session = createSession({
      sourceType: picked.kind,
      sourceId: picked.id,
      sourceLabel: current.title,
      exerciseType: type,
      wordIds: sessionWords.map((w) => w.id),
      words: current.lexicon ? sessionWords : undefined,
      // Pausing on exit is for homework tied to a course lesson (not yet).
      resumable: false,
    })
    navigate(`/words/trainer/session/${session.id}`)
  }

  const groups = ['Повторение', 'Понимание', 'Аудирование', 'Игровые форматы']
  const hwPicked = pickedKind === 'homework'
  const colPicked = pickedKind === 'collection'
  const hwTitle = hwPicked
    ? homework?.find((h) => h.id === pickedId)?.title || current?.title
    : ''

  return (
    <div className="trainer-hub">
      <p className="dict-lead">
        Ваше пространство для практики слов. Учитесь в комфортном темпе.
      </p>
      <section className="glass-panel trainer-sources">
        <div className="trainer-pickers" ref={pickers}>
          <div className="trainer-picker">
            <button
              type="button"
              className={`trainer-picker__toggle${hwPicked ? ' is-picked' : ''}`}
              aria-expanded={open === 'homework'}
              disabled={colPicked}
              title={colPicked ? 'Сначала сбросьте выбранную коллекцию' : undefined}
              onClick={() => setOpen(open === 'homework' ? '' : 'homework')}
            >
              <ClipboardList size={18} aria-hidden="true" />
              <span>{hwPicked ? hwTitle : 'Домашнее задание'}</span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {open === 'homework' && (
              <ul className="trainer-picker__menu">
                {!homework && <li className="caption">Загружаем задания…</li>}
                {homework && !homework.length && (
                  <li className="caption">
                    Нет заданий к выполнению или на доработке.
                  </li>
                )}
                {homework?.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      disabled={!h.wordCount}
                      className={hwPicked && pickedId === h.id ? 'is-active' : ''}
                      onClick={() => choose({ kind: 'homework', id: h.id })}
                    >
                      <strong>{h.title}</strong>
                      <small>
                        {HW_STATUS[h.status]}
                        {h.due && ` · до ${friendlyDate(h.due)}`} ·{' '}
                        {h.wordCount ? wordsCount(h.wordCount) : 'без слов'}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="trainer-picker">
            <button
              type="button"
              className={`trainer-picker__toggle${colPicked ? ' is-picked' : ''}`}
              aria-expanded={open === 'collection'}
              disabled={hwPicked}
              title={hwPicked ? 'Сначала сбросьте выбранное задание' : undefined}
              onClick={() => setOpen(open === 'collection' ? '' : 'collection')}
            >
              <Layers size={18} aria-hidden="true" />
              <span>
                {colPicked ? collection?.title || 'Коллекция' : 'Мои коллекции'}
              </span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {open === 'collection' && (
              <ul className="trainer-picker__menu">
                {!collections.length && (
                  <li className="caption">
                    Коллекций пока нет — их можно будет создавать в словаре.
                  </li>
                )}
                {collections.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={!c.wordIds.length}
                      className={colPicked && pickedId === c.id ? 'is-active' : ''}
                      onClick={() => choose({ kind: 'collection', id: c.id })}
                    >
                      <strong>{c.title}</strong>
                      <small>{wordsCount(c.wordIds.length)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {picked ? (
          <p className="trainer-set">
            <span>
              {pickedKind === 'topic' ? 'Подтема' : 'Набор'}:{' '}
              <strong>{current?.title || '…'}</strong>
              {current && (
                <>
                  {' '}
                  · {wordsCount(current.words.length)}
                  {current.words.length > SESSION_SIZE &&
                    ` · в занятии ${SESSION_SIZE}, сначала неосвоенные`}
                </>
              )}
            </span>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setPicked(null)
                navigate('/words/trainer', { replace: true })
              }}
            >
              <X size={14} /> Сбросить
            </button>
          </p>
        ) : (
          <p className="caption trainer-set">
            Выберите домашнее задание или коллекцию — из их слов соберётся
            тренировка.
          </p>
        )}
      </section>
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
                    disabled={!sessionWords.length}
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
    </div>
  )
}
