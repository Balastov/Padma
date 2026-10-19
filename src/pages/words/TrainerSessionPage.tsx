import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ChartColumn,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock3,
  Dumbbell,
  Flame,
  Heart,
  LogOut,
  Play,
  RotateCcw,
  SkipForward,
  Target,
  XCircle,
} from 'lucide-react'
import {
  getWord,
  getWordsByIds,
  loadCatalog,
  registerWords,
} from '../../student/catalogStore'
import { EXERCISE_META } from '../../student/types'
import {
  createSession,
  deleteSession,
  getSession,
  localDay,
  practiceDays,
  upsertSession,
  type TrainerSession,
} from '../../student/sessionStore'
import { bumpWordFromAnswer } from '../../student/progressStore'
import { WordAudioButton } from './WordAudioButton'
import './TrainerPage.css'

function shuffle<T>(arr: T[]) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function TrainerSessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<TrainerSession | null>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    void loadCatalog().then(() => {
      const s = getSession(sessionId || '')
      if (!s) return
      if (s.words) registerWords(s.words)
      setSession(s)
      setElapsed(s.elapsedSec)
    })
  }, [sessionId])

  useEffect(() => {
    if (!session || session.status !== 'active') return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [session?.id, session?.status])

  const words = useMemo(
    () => getWordsByIds(session?.wordIds || []),
    [session?.wordIds],
  )
  const current = words[session?.currentIndex || 0]

  function persist(next: TrainerSession) {
    upsertSession(next)
    setSession(next)
  }

  function answer(correct: boolean, ms = 0, skipped = false) {
    if (!session || !current) return
    bumpWordFromAnswer(current.id, correct)
    const answers = [
      ...session.answers,
      { wordId: current.id, correct, ms, ...(skipped ? { skipped } : {}) },
    ]
    const nextIndex = session.currentIndex + 1
    if (nextIndex >= session.wordIds.length) {
      const done = {
        ...session,
        answers,
        currentIndex: nextIndex,
        status: 'done' as const,
        elapsedSec: elapsed,
      }
      persist(done)
      navigate(`/words/trainer/result/${session.id}`)
      return
    }
    persist({
      ...session,
      answers,
      currentIndex: nextIndex,
      elapsedSec: elapsed,
      status: 'active',
    })
  }

  // Leaving keeps the attempt only for homework tied to a course lesson;
  // otherwise the timer and answers start over next time.
  function exit() {
    if (!session) return
    if (session.resumable)
      persist({ ...session, status: 'paused', elapsedSec: elapsed })
    else deleteSession(session.id)
    navigate(
      `/words/trainer?source=${session.sourceType}&id=${encodeURIComponent(session.sourceId)}`,
    )
  }

  if (!session) return <p className="empty-state">Сессия не найдена</p>
  if (!current && session.status === 'done') {
    navigate(`/words/trainer/result/${session.id}`)
    return null
  }
  if (!current) return <p className="empty-state">Нет слов</p>

  const pct = Math.round(
    (session.currentIndex / Math.max(session.wordIds.length, 1)) * 100,
  )
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="trainer-session">
      <nav className="glass-panel trainer-context" aria-label="Занятие">
        <span>
          <strong>{session.sourceLabel}</strong>
          <small>{session.wordIds.length} слов в занятии</small>
        </span>
        <span>
          <Dumbbell size={18} aria-hidden="true" />
          {EXERCISE_META[session.exerciseType].title}
        </span>
      </nav>
      <section className="glass-panel trainer-board">
        <div className="trainer-progress">
          <strong>
            {Math.min(session.currentIndex + 1, session.wordIds.length)} из{' '}
            {session.wordIds.length}
          </strong>
          <div className="trainer-progress__bar">
            <span style={{ width: `${pct}%` }} />
          </div>
          <span className="trainer-timer">
            <Clock3 size={16} aria-hidden="true" />
            {mm}:{ss}
          </span>
        </div>
        <Exercise
          type={session.exerciseType}
          wordId={current.id}
          poolIds={session.wordIds}
          onAnswer={answer}
          onFinishGame={() => {
            if (!session) return
            const answers = session.wordIds.map((id) => ({
              wordId: id,
              correct: true,
              ms: 0,
            }))
            const done = {
              ...session,
              answers,
              currentIndex: session.wordIds.length,
              status: 'done' as const,
              elapsedSec: elapsed,
            }
            persist(done)
            navigate(`/words/trainer/result/${session.id}`)
          }}
        />
        <div className="trainer-session__actions">
          <button
            type="button"
            className="button-secondary button-small"
            onClick={() => answer(false, 0, true)}
          >
            <SkipForward size={16} /> Пропустить
          </button>
          <button type="button" className="text-button" onClick={exit}>
            <LogOut size={16} /> Выйти из тренажёра
          </button>
        </div>
      </section>
      <aside className="glass-panel session-words">
        <h2>Слова в этом занятии</h2>
        <ul>
          {words.map((w, i) => {
            const result = session.answers[i]
            const cur = i === session.currentIndex
            const state = result
              ? result.correct
                ? 'is-ok'
                : 'is-missed'
              : cur
                ? 'is-current'
                : ''
            return (
              <li key={w.id} className={state}>
                {result ? (
                  result.correct ? (
                    <CheckCircle2 size={20} aria-label="Верно" />
                  ) : (
                    <XCircle
                      size={20}
                      aria-label={result.skipped ? 'Пропущено' : 'Ошибка'}
                    />
                  )
                ) : cur ? (
                  <CircleDot size={20} aria-label="Текущее" />
                ) : (
                  <Circle size={20} aria-label="В очереди" />
                )}
                <span>
                  <strong>{w.word}</strong>
                  <small>{cur ? '…' : w.translation}</small>
                </span>
              </li>
            )
          })}
        </ul>
      </aside>
    </div>
  )
}

function Exercise({
  type,
  wordId,
  poolIds,
  onAnswer,
  onFinishGame,
}: {
  type: TrainerSession['exerciseType']
  wordId: string
  poolIds: string[]
  onAnswer: (correct: boolean) => void
  onFinishGame: () => void
}) {
  const word = getWord(wordId)!
  if (type === 'cards') return <CardsEx wordId={wordId} onAnswer={onAnswer} />
  if (type === 'training-cards')
    return <TrainingCardsEx wordId={wordId} onAnswer={onAnswer} />
  if (type === 'assemble' || type === 'assemble-audio')
    return (
      <AssembleEx
        wordId={wordId}
        audioOnly={type === 'assemble-audio'}
        onAnswer={onAnswer}
      />
    )
  if (type === 'choose-translation' || type === 'choose-translation-audio')
    return (
      <ChooseEx
        wordId={wordId}
        poolIds={poolIds}
        audioOnly={type === 'choose-translation-audio'}
        onAnswer={onAnswer}
      />
    )
  if (type === 'true-false')
    return <TrueFalseEx wordId={wordId} poolIds={poolIds} onAnswer={onAnswer} />
  if (type === 'match-pairs')
    return <MatchPairsEx poolIds={poolIds} onFinish={onFinishGame} />
  if (type === 'memory')
    return <MemoryEx poolIds={poolIds} onFinish={onFinishGame} />
  if (type === 'find-word')
    return <FindWordEx wordId={wordId} onAnswer={onAnswer} />
  return (
    <p>
      {word.word} <WordAudioButton word={word.word} />
    </p>
  )
}

function CardsEx({
  wordId,
  onAnswer,
}: {
  wordId: string
  onAnswer: (c: boolean) => void
}) {
  const w = getWord(wordId)!
  const [show, setShow] = useState(false)
  return (
    <div>
      <h2>{w.word}</h2>
      <p className="ipa">{w.transcription}</p>
      <WordAudioButton word={w.word} />
      <p className="secondary">{w.exampleEn}</p>
      {show ? (
        <>
          <p>{w.translation}</p>
          <button
            type="button"
            className="button-primary"
            onClick={() => onAnswer(true)}
          >
            Следующее
          </button>
        </>
      ) : (
        <button
          type="button"
          className="button-primary"
          onClick={() => setShow(true)}
        >
          Показать перевод
        </button>
      )}
    </div>
  )
}

function TrainingCardsEx({
  wordId,
  onAnswer,
}: {
  wordId: string
  onAnswer: (c: boolean) => void
}) {
  const w = getWord(wordId)!
  const [show, setShow] = useState(false)
  return (
    <div>
      <p className="caption">Посмотрите на слово</p>
      <h2>{w.word}</h2>
      <p className="ipa">{w.transcription}</p>
      <WordAudioButton word={w.word} />
      {!show ? (
        <button
          type="button"
          className="button-secondary"
          onClick={() => setShow(true)}
        >
          Показать перевод
        </button>
      ) : (
        <>
          <p>{w.translation}</p>
          <div className="rate-row">
            <button type="button" className="rate-easy" onClick={() => onAnswer(true)}>
              Легко
            </button>
            <button type="button" className="rate-more" onClick={() => onAnswer(true)}>
              Надо ещё
            </button>
            <button type="button" className="rate-later" onClick={() => onAnswer(false)}>
              Повторить позже
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function AssembleEx({
  wordId,
  audioOnly,
  onAnswer,
}: {
  wordId: string
  audioOnly: boolean
  onAnswer: (c: boolean) => void
}) {
  const w = getWord(wordId)!
  const letters = useMemo(
    () => shuffle(w.word.replace(/\s/g, '').toLowerCase().split('')),
    [w.word],
  )
  const [picked, setPicked] = useState<number[]>([])
  const built = picked.map((i) => letters[i]).join('')
  const target = w.word.replace(/\s/g, '').toLowerCase()
  return (
    <div>
      <h2>{audioOnly ? 'Соберите слово по аудио' : w.translation}</h2>
      {audioOnly ? (
        <WordAudioButton word={w.word} />
      ) : (
        <p className="caption">Соберите английское слово</p>
      )}
      <p style={{ fontSize: '1.4rem', letterSpacing: '0.08em' }}>
        {built || '…'}
      </p>
      <div className="letter-bank">
        {letters.map((ch, i) => (
          <button
            key={`${ch}-${i}`}
            type="button"
            disabled={picked.includes(i)}
            onClick={() => setPicked([...picked, i])}
          >
            {ch}
          </button>
        ))}
      </div>
      <div className="trainer-result__actions">
        <button type="button" className="button-secondary" onClick={() => setPicked([])}>
          Сбросить
        </button>
        <button
          type="button"
          className="button-primary"
          onClick={() => onAnswer(built === target)}
        >
          Проверить
        </button>
      </div>
    </div>
  )
}

function ChooseEx({
  wordId,
  poolIds,
  audioOnly,
  onAnswer,
}: {
  wordId: string
  poolIds: string[]
  audioOnly: boolean
  onAnswer: (c: boolean) => void
}) {
  const w = getWord(wordId)!
  const options = useMemo(() => {
    const others = shuffle(
      getWordsByIds(poolIds.filter((id) => id !== wordId)),
    )
      .slice(0, 3)
      .map((x) => x.translation)
    return shuffle([w.translation, ...others])
  }, [wordId, poolIds, w.translation])
  return (
    <div>
      <h2>{audioOnly ? 'Выберите перевод' : w.word}</h2>
      {!audioOnly && <p className="ipa">{w.transcription}</p>}
      <WordAudioButton word={w.word} />
      <div className="choice-grid">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onAnswer(opt === w.translation)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function TrueFalseEx({
  wordId,
  poolIds,
  onAnswer,
}: {
  wordId: string
  poolIds: string[]
  onAnswer: (c: boolean) => void
}) {
  const w = getWord(wordId)!
  const shown = useMemo(() => {
    const wrong = (wordId.length + wordId.charCodeAt(2) || 0) % 2 === 0
    if (!wrong) return { text: w.translation, truth: true }
    const other =
      getWordsByIds(poolIds.filter((id) => id !== wordId))[0]?.translation ||
      'неизвестно'
    return { text: other, truth: false }
  }, [wordId, poolIds, w.translation])
  return (
    <div>
      <h2>Верно — неверно</h2>
      <p className="caption">Верный ли перевод?</p>
      <h3>{w.word}</h3>
      <WordAudioButton word={w.word} />
      <p style={{ fontSize: '1.2rem' }}>{shown.text}</p>
      <div className="tf-actions">
        <button
          type="button"
          className="tf-yes"
          onClick={() => onAnswer(shown.truth === true)}
        >
          Верно
        </button>
        <button
          type="button"
          className="tf-no"
          onClick={() => onAnswer(shown.truth === false)}
        >
          Неверно
        </button>
      </div>
    </div>
  )
}

function MatchPairsEx({
  poolIds,
  onFinish,
}: {
  poolIds: string[]
  onFinish: () => void
}) {
  const words = useMemo(
    () => shuffle(getWordsByIds(poolIds)).slice(0, 4),
    [poolIds],
  )
  const left = words
  const right = useMemo(
    () => shuffle(words.map((w) => ({ id: w.id, t: w.translation }))),
    [words],
  )
  const [pickL, setPickL] = useState<string | null>(null)
  const [done, setDone] = useState<string[]>([])
  function pickR(id: string) {
    if (!pickL) return
    if (pickL === id) {
      const next = [...done, id]
      setDone(next)
      setPickL(null)
      if (next.length >= left.length) onFinish()
    } else {
      setPickL(null)
    }
  }
  return (
    <div>
      <h2>Собери пару</h2>
      <div className="pair-board">
        <div>
          {left.map((w) => (
            <button
              key={w.id}
              type="button"
              className={
                done.includes(w.id)
                  ? 'is-done'
                  : pickL === w.id
                    ? 'is-picked'
                    : ''
              }
              disabled={done.includes(w.id)}
              onClick={() => setPickL(w.id)}
            >
              {w.word}
            </button>
          ))}
        </div>
        <div>
          {right.map((r) => (
            <button
              key={r.id}
              type="button"
              className={done.includes(r.id) ? 'is-done' : ''}
              disabled={done.includes(r.id)}
              onClick={() => pickR(r.id)}
            >
              {r.t}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function MemoryEx({
  poolIds,
  onFinish,
}: {
  poolIds: string[]
  onFinish: () => void
}) {
  const base = useMemo(
    () => shuffle(getWordsByIds(poolIds)).slice(0, 4),
    [poolIds],
  )
  const cards = useMemo(
    () =>
      shuffle([
        ...base.map((w) => ({ key: w.id + '-en', pair: w.id, label: w.word })),
        ...base.map((w) => ({
          key: w.id + '-ru',
          pair: w.id,
          label: w.translation,
        })),
      ]),
    [base],
  )
  const [open, setOpen] = useState<string[]>([])
  const [matched, setMatched] = useState<string[]>([])
  function flip(key: string, pair: string) {
    if (matched.includes(pair) || open.includes(key)) return
    const next = [...open, key]
    if (next.length < 2) {
      setOpen(next)
      return
    }
    const [a, b] = next
    const ca = cards.find((c) => c.key === a)!
    const cb = cards.find((c) => c.key === b)!
    if (ca.pair === cb.pair) {
      const m = [...matched, ca.pair]
      setMatched(m)
      setOpen([])
      if (m.length >= base.length) onFinish()
    } else {
      setOpen(next)
      setTimeout(() => setOpen([]), 600)
    }
  }
  return (
    <div>
      <h2>Мемория</h2>
      <p className="caption">
        Открыто пар: {matched.length} из {base.length}
      </p>
      <div className="memory-grid">
        {cards.map((c) => {
          const shown = open.includes(c.key) || matched.includes(c.pair)
          return (
            <button
              key={c.key}
              type="button"
              className={shown ? 'is-open' : ''}
              onClick={() => flip(c.key, c.pair)}
            >
              {shown ? c.label : '✦'}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FindWordEx({
  wordId,
  onAnswer,
}: {
  wordId: string
  onAnswer: (c: boolean) => void
}) {
  const w = getWord(wordId)!
  const target = w.word.replace(/\s/g, '').toUpperCase()
  const size = Math.max(8, target.length + 2)
  const grid = useMemo(() => {
    const g = Array.from({ length: size }, () =>
      Array.from({ length: size }, () =>
        String.fromCharCode(65 + Math.floor(Math.random() * 26)),
      ),
    )
    const row = 2
    const col = 1
    for (let i = 0; i < target.length; i++) g[row][col + i] = target[i]
    return g
  }, [target, size])
  const [sel, setSel] = useState<string[]>([])
  function toggle(r: number, c: number) {
    const key = `${r}-${c}`
    setSel((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    )
  }
  function check() {
    const letters = sel
      .map((k) => {
        const [r, c] = k.split('-').map(Number)
        return grid[r][c]
      })
      .join('')
    onAnswer(letters === target)
  }
  return (
    <div>
      <h2>Найди слово</h2>
      <p>
        Подсказка: <strong>{w.translation}</strong>
      </p>
      <div className="find-grid">
        {grid.map((row, ri) => (
          <div key={ri} className="find-grid__row">
            {row.map((ch, ci) => (
              <button
                key={ci}
                type="button"
                className={`find-grid__cell${sel.includes(`${ri}-${ci}`) ? ' is-on' : ''}`}
                onClick={() => toggle(ri, ci)}
              >
                {ch}
              </button>
            ))}
          </div>
        ))}
      </div>
      <button type="button" className="button-primary" onClick={check}>
        Проверить
      </button>
    </div>
  )
}

function streakDays() {
  const days = new Set(practiceDays())
  const day = new Date()
  if (!days.has(localDay(day))) day.setDate(day.getDate() - 1)
  let streak = 0
  while (days.has(localDay(day))) {
    streak++
    day.setDate(day.getDate() - 1)
  }
  return streak
}

const plural = (n: number, forms: [string, string, string]) => {
  const tail = n % 100 > 10 && n % 100 < 20 ? 5 : n % 10
  return forms[tail === 1 ? 0 : tail >= 2 && tail <= 4 ? 1 : 2]
}

export function TrainerResultPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const session = getSession(sessionId || '')
  if (!session) return <p className="empty-state">Результат не найден</p>
  if (session.words) registerWords(session.words)
  const total = session.answers.length || 1
  const ok = session.answers.filter((a) => a.correct).length
  const skipped = session.answers.filter((a) => a.skipped).length
  const pct = Math.round((ok / total) * 100)
  const weak = session.answers
    .filter((a) => !a.correct)
    .map((a) => getWord(a.wordId))
    .filter((w): w is NonNullable<typeof w> => Boolean(w))
  const minutes = Math.floor(session.elapsedSec / 60)
  const seconds = session.elapsedSec % 60
  const streak = streakDays()
  const verdict =
    pct >= 80
      ? ['Отличный результат!', 'Вы уверенно справились с тренировкой.']
      : pct >= 50
        ? ['Хороший результат', 'Ещё немного практики — и слова закрепятся.']
        : ['Есть над чем поработать', 'Повторите сложные слова — это лучший шаг сейчас.']
  const again = `/words/trainer?source=${session.sourceType}&id=${encodeURIComponent(session.sourceId)}`

  function retryWeak() {
    if (!session || !weak.length) return
    const next = createSession({
      sourceType: session.sourceType,
      sourceId: session.sourceId,
      sourceLabel: session.sourceLabel,
      exerciseType: session.exerciseType,
      wordIds: weak.map((w) => w.id),
      words: session.words?.filter((w) => weak.some((x) => x.id === w.id)),
      resumable: session.resumable,
    })
    navigate(`/words/trainer/session/${next.id}`)
  }

  return (
    <div className="trainer-result-page">
      <header>
        <h1>Результат тренировки</h1>
        <p className="secondary">
          {weak.length
            ? 'Вы хорошо поработали — закрепим трудные слова ещё раз.'
            : 'Все слова без ошибок — так держать!'}
        </p>
      </header>
      <section className="glass-panel trainer-result-hero">
        <div
          className="trainer-result-ring"
          style={{ '--percent': pct } as CSSProperties}
        >
          <strong>{pct}%</strong>
          <small>
            {ok} из {session.answers.length} верно
          </small>
        </div>
        <div className="trainer-result-hero__body">
          <h2>{verdict[0]}</h2>
          <p className="secondary">{verdict[1]}</p>
          <div className="trainer-result-stats">
            <div>
              <Clock3 size={20} aria-hidden="true" />
              <span>
                <small>Время</small>
                <strong>
                  {minutes ? `${minutes} мин ` : ''}
                  {seconds} сек
                </strong>
              </span>
            </div>
            <div>
              <Flame size={20} aria-hidden="true" />
              <span>
                <small>Серия</small>
                <strong>
                  {streak} {plural(streak, ['день', 'дня', 'дней'])}
                </strong>
              </span>
            </div>
            <div>
              <Target size={20} aria-hidden="true" />
              <span>
                <small>Набор</small>
                <strong>{session.sourceLabel}</strong>
              </span>
            </div>
          </div>
        </div>
      </section>
      <div className="trainer-result-grid">
        <section className="glass-panel trainer-result-good">
          <h2>
            <ChartColumn size={20} aria-hidden="true" /> Что получилось хорошо
          </h2>
          <div className="trainer-result-row">
            <span>
              <strong>{EXERCISE_META[session.exerciseType].title}</strong>
              <small>
                {ok} из {session.answers.length} верно
                {skipped > 0 && ` · пропущено ${skipped}`}
              </small>
            </span>
            <span className="trainer-result-bar">
              <span style={{ width: `${pct}%` }} />
            </span>
            <strong>{pct}%</strong>
          </div>
        </section>
        <section className="glass-panel trainer-result-weak">
          <h2>
            <Heart size={20} aria-hidden="true" /> Стоит повторить
          </h2>
          {!weak.length ? (
            <p className="caption">Ошибок нет — повторять нечего.</p>
          ) : (
            <ul>
              {weak.map((w) => (
                <li key={w.id}>
                  <strong>{w.word}</strong>
                  <WordAudioButton word={w.word} />
                  <span>{w.translation}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="trainer-result-actions glass-panel">
        <button
          type="button"
          className="button-primary"
          disabled={!weak.length}
          onClick={retryWeak}
        >
          <RotateCcw size={18} /> Повторить сложные слова
        </button>
        <Link className="button-secondary" to={again}>
          <Play size={18} /> Следующая тренировка
        </Link>
        <Link className="button-secondary" to="/words/progress">
          <ChartColumn size={18} /> К прогрессу
        </Link>
      </div>
    </div>
  )
}
