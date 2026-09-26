import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, Circle } from 'lucide-react'
import { getWord, getWordsByIds } from '../../student/mock/seed'
import { EXERCISE_META } from '../../student/types'
import {
  getSession,
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
    const s = getSession(sessionId || '')
    if (!s) return
    setSession(s)
    setElapsed(s.elapsedSec)
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

  function answer(correct: boolean, ms = 0) {
    if (!session || !current) return
    bumpWordFromAnswer(current.id, correct)
    const answers = [
      ...session.answers,
      { wordId: current.id, correct, ms },
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

  function pause() {
    if (!session) return
    persist({ ...session, status: 'paused', elapsedSec: elapsed })
    navigate('/words/trainer')
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
      <section className="glass-panel trainer-board">
        <div className="dict-crumbs">
          <span>{session.sourceLabel}</span>
          <span>·</span>
          <span>{EXERCISE_META[session.exerciseType].title}</span>
        </div>
        <div className="trainer-progress">
          <strong>
            {Math.min(session.currentIndex + 1, session.wordIds.length)} из{' '}
            {session.wordIds.length}
          </strong>
          <div className="trainer-progress__bar">
            <span style={{ width: `${pct}%` }} />
          </div>
          <span>
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
        <div className="trainer-result__actions">
          <button type="button" className="text-button" onClick={pause}>
            Завершить позже
          </button>
          <button
            type="button"
            className="button-secondary button-small"
            onClick={() => answer(false)}
          >
            Пропустить
          </button>
        </div>
      </section>
      <aside className="glass-panel session-words">
        <h2>Слова в этом занятии</h2>
        <ul>
          {words.map((w, i) => {
            const done = i < session.currentIndex
            const cur = i === session.currentIndex
            return (
              <li
                key={w.id}
                className={cur ? 'is-current' : done ? 'is-done' : ''}
              >
                <div>
                  {done ? (
                    <Check size={14} color="#10b981" />
                  ) : (
                    <Circle
                      size={14}
                      color={cur ? '#536cff' : '#a7afc8'}
                      fill={cur ? '#536cff' : 'transparent'}
                    />
                  )}{' '}
                  <strong>{w.word}</strong>
                  <small> {done || !cur ? w.translation : '…'}</small>
                </div>
                <WordAudioButton word={w.word} />
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

export function TrainerResultPage() {
  const { sessionId } = useParams()
  const session = getSession(sessionId || '')
  if (!session) return <p className="empty-state">Результат не найден</p>
  const total = session.answers.length || 1
  const ok = session.answers.filter((a) => a.correct).length
  const pct = Math.round((ok / total) * 100)
  const weak = session.answers
    .filter((a) => !a.correct)
    .map((a) => getWord(a.wordId))
    .filter(Boolean)
  return (
    <section className="glass-panel trainer-result">
      <h1>Результат тренировки</h1>
      <p style={{ fontSize: '2rem', margin: 0 }}>{pct}%</p>
      <p>
        {ok} из {session.answers.length} · {Math.round(session.elapsedSec / 60) || 1}{' '}
        мин
      </p>
      {weak.length > 0 && (
        <div>
          <h2>Слова, к которым стоит вернуться</h2>
          <ul>
            {weak.map((w) => (
              <li key={w!.id}>
                {w!.word} · {w!.translation}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="trainer-result__actions">
        <Link className="button-primary" to="/words/trainer?source=revisit">
          Повторить эти слова
        </Link>
        <Link className="button-secondary" to="/words/trainer">
          Следующая тренировка
        </Link>
        <Link className="button-secondary" to="/words/progress">
          К прогрессу
        </Link>
      </div>
    </section>
  )
}
