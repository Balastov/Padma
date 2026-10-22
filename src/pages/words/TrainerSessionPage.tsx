import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import type { VocabWord } from '../../student/types'
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
import { answersSent, fetchMyMetrics } from '../../student/lexicon'
import { WordAudioButton } from './WordAudioButton'
import {
  AssembleFormat,
  CardsFormat,
  ChooseFormat,
  TrainingCardsFormat,
  TrueFalseFormat,
} from './exercises'
import { FindWordFormat, MatchPairsFormat, MemoryFormat } from './games'
import type { GameResult } from './games'
import './TrainerPage.css'

export default function TrainerSessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<TrainerSession | null>(null)
  const [elapsed, setElapsed] = useState(0)
  // Words in play for multi-word formats (pairs, memory).
  const [activeIds, setActiveIds] = useState<string[]>([])
  const [sideSlot, setSideSlot] = useState<HTMLDivElement | null>(null)
  const latest = useRef<{ session: TrainerSession | null; elapsed: number }>({
    session: null,
    elapsed: 0,
  })
  // Answers arrive from clicks and timers, after the latest render.
  useLayoutEffect(() => {
    latest.current = { session, elapsed }
  })

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
  const current = words[session?.answers.length || 0]

  function persist(next: TrainerSession) {
    upsertSession(next)
    setSession(next)
  }

  // One or several answers; games may answer out of order and later.
  function record(results: GameResult[]) {
    const { session, elapsed } = latest.current
    if (!session || !results.length) return
    for (const r of results)
      bumpWordFromAnswer(r.wordId, r.correct, {
        format: session.exerciseType,
        sessionId: session.id,
        sourceType: session.sourceType,
        sourceId: session.sourceId,
        sourceLabel: session.sourceLabel,
        skipped: r.skipped,
        hinted: r.hinted,
      })
    const answers = [
      ...session.answers,
      ...results.map((r) => ({
        wordId: r.wordId,
        correct: r.correct,
        ms: 0,
        ...(r.skipped ? { skipped: true } : {}),
      })),
    ]
    const nextIndex = answers.length
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

  const answer = (correct: boolean, skipped = false, hinted = false) =>
    current && record([{ wordId: current.id, correct, skipped, hinted }])

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

  const answered = session.answers.length
  const pct = Math.round((answered / Math.max(session.wordIds.length, 1)) * 100)
  const group = GROUP_FORMATS.has(session.exerciseType)
  const resultOf = new Map(session.answers.map((a) => [a.wordId, a]))
  // Until answered, the list must not give the answer away.
  const hideWord = ANSWER_IS_WORD.has(session.exerciseType)
  const hideTranslation = ANSWER_IS_TRANSLATION.has(session.exerciseType)
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
            {group ? answered : Math.min(answered + 1, session.wordIds.length)} из{' '}
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
          sessionId={session.id}
          type={session.exerciseType}
          wordId={current.id}
          words={words}
          onAnswer={(correct, hinted) => answer(correct, false, hinted)}
          onSkip={() => answer(false, true)}
          onAnswers={record}
          onActive={setActiveIds}
          onPenalty={(sec) => setElapsed((e) => e + sec)}
          sideSlot={sideSlot}
        />
        <div className="trainer-session__actions">
          <button type="button" className="text-button" onClick={exit}>
            <LogOut size={16} /> Выйти из тренажёра
          </button>
        </div>
      </section>
      <aside className="glass-panel session-words">
        <div ref={setSideSlot} className="session-side-slot" />
        <h2>Слова в этом занятии</h2>
        <ul>
          {words.map((w) => {
            const result = resultOf.get(w.id)
            const cur =
              !result && (group ? activeIds.includes(w.id) : w.id === current.id)
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
                  <strong>{!result && hideWord ? '•••' : w.word}</strong>
                  <small>
                    {result
                      ? w.translation
                      : cur || hideTranslation
                        ? '…'
                        : w.translation}
                  </small>
                </span>
              </li>
            )
          })}
        </ul>
      </aside>
    </div>
  )
}

const ANSWER_IS_WORD = new Set(['assemble', 'assemble-audio', 'find-word'])
const ANSWER_IS_TRANSLATION = new Set([
  'choose-translation',
  'choose-translation-audio',
  'true-false',
  'match-pairs',
  'memory',
])
// Formats that play several words at once.
const GROUP_FORMATS = new Set(['match-pairs', 'memory'])

function Exercise({
  sessionId,
  type,
  wordId,
  words,
  onAnswer,
  onSkip,
  onAnswers,
  onActive,
  onPenalty,
  sideSlot,
}: {
  sessionId: string
  type: TrainerSession['exerciseType']
  wordId: string
  words: VocabWord[]
  onAnswer: (correct: boolean, hinted?: boolean) => void
  onSkip: () => void
  onAnswers: (results: GameResult[]) => void
  onActive: (ids: string[]) => void
  onPenalty: (seconds: number) => void
  sideSlot: HTMLElement | null
}) {
  const word = getWord(wordId)!
  const pool = words.filter((w) => w.id !== wordId)
  if (type === 'cards')
    return <CardsFormat key={wordId} word={word} onAnswer={onAnswer} />
  if (type === 'training-cards')
    return (
      <TrainingCardsFormat key={wordId} word={word} onAnswer={onAnswer} onSkip={onSkip} />
    )
  if (type === 'assemble' || type === 'assemble-audio')
    return (
      <AssembleFormat
        key={wordId}
        word={word}
        audioOnly={type === 'assemble-audio'}
        onAnswer={onAnswer}
        onSkip={onSkip}
      />
    )
  if (type === 'choose-translation' || type === 'choose-translation-audio')
    return (
      <ChooseFormat
        key={wordId}
        word={word}
        pool={pool}
        audioOnly={type === 'choose-translation-audio'}
        onAnswer={onAnswer}
        onSkip={onSkip}
      />
    )
  if (type === 'true-false')
    return (
      <TrueFalseFormat key={wordId} word={word} pool={pool} onAnswer={onAnswer} onSkip={onSkip} />
    )
  if (type === 'match-pairs')
    return (
      <MatchPairsFormat
        key={sessionId}
        words={words}
        onAnswers={onAnswers}
        onActive={onActive}
      />
    )
  if (type === 'memory')
    return (
      <MemoryFormat
        key={sessionId}
        words={words}
        onAnswers={onAnswers}
        onActive={onActive}
        sideSlot={sideSlot}
      />
    )
  return (
    <FindWordFormat
      key={wordId}
      word={word}
      onAnswer={onAnswer}
      onSkip={onSkip}
      onPenalty={onPenalty}
    />
  )
}

// Fallback while the server streak loads or for words outside the dictionary.
function localStreak() {
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

// The finished session already counts for today, even if its last answers
// are still on their way to the server.
function useServerStreak() {
  const [streak, setStreak] = useState(localStreak)
  useEffect(() => {
    let active = true
    answersSent()
      .then(() => fetchMyMetrics())
      .then((m) => {
        if (active)
          setStreak(m.streak.today ? m.streak.current : m.streak.current + 1)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  return streak
}

export function TrainerResultPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const streak = useServerStreak()
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
