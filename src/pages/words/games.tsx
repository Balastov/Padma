import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  Crown,
  ImageIcon,
  RotateCcw,
  Search,
  SkipForward,
  Trophy,
  Volume2,
} from 'lucide-react'
import type { VocabWord } from '../../student/types'
import { playWordAudio, speakText } from '../../student/audio'
import { fetchRecord, saveRecord } from '../../student/lexicon'
import type { TrainerRecord } from '../../student/lexicon'
import {
  assembleTarget,
  bareTerm,
  cheer,
  praise,
  reveal,
  shuffle,
} from './exerciseUtils'
import './exercises.css'
import './games.css'

export type GameResult = { wordId: string; correct: boolean; skipped?: boolean }

const clock = (sec: number) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`

function Heading({ title, hint }: { title: string; hint: string }) {
  return (
    <header className="ex-heading">
      <h2>{title}</h2>
      <p className="secondary">{hint}</p>
    </header>
  )
}

/* ——— Найди слово ——— */
const COLS = 10
const ROWS = 8
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

const neighbours = (i: number) => {
  const r = Math.floor(i / COLS)
  const c = i % COLS
  return [
    r > 0 ? i - COLS : -1,
    r < ROWS - 1 ? i + COLS : -1,
    c > 0 ? i - 1 : -1,
    c < COLS - 1 ? i + 1 : -1,
  ].filter((n) => n >= 0)
}
const adjacent = (a: number, b: number) => neighbours(a).includes(b)

// Snake path: random walk with backtracking, only 90° moves, no revisits.
function snakePath(length: number): number[] | null {
  const start = Math.floor(Math.random() * COLS * ROWS)
  const path = [start]
  const used = new Set(path)
  let steps = 0
  const walk = (): boolean => {
    if (path.length === length) return true
    if (++steps > 4000) return false
    for (const next of shuffle(neighbours(path[path.length - 1]))) {
      if (used.has(next)) continue
      path.push(next)
      used.add(next)
      if (walk()) return true
      path.pop()
      used.delete(next)
    }
    return false
  }
  return walk() ? path : null
}

function straightPath(length: number): number[] | null {
  const horizontal = Math.random() < 0.5
  const span = horizontal ? COLS : ROWS
  if (length > span) return null
  const offset = Math.floor(Math.random() * (span - length + 1))
  const line = Math.floor(Math.random() * (horizontal ? ROWS : COLS))
  return Array.from({ length }, (_, k) =>
    horizontal ? line * COLS + offset + k : (offset + k) * COLS + line,
  )
}

function buildGrid(target: string) {
  const path =
    (Math.random() < 0.5 && straightPath(target.length)) ||
    snakePath(target.length) ||
    straightPath(target.length) ||
    []
  const cells = Array.from(
    { length: COLS * ROWS },
    () => LETTERS[Math.floor(Math.random() * LETTERS.length)],
  )
  path.forEach((cell, k) => (cells[cell] = target[k]))
  return { cells, path }
}

export function FindWordFormat({
  word,
  onAnswer,
  onSkip,
  onPenalty,
}: {
  word: VocabWord
  onAnswer: (correct: boolean) => void
  onSkip: () => void
  onPenalty: (seconds: number) => void
}) {
  const target = useMemo(() => assembleTarget(word.word), [word.word])
  const [grid] = useState(() => buildGrid(target))
  const [selected, setSelected] = useState<number[]>([])
  const [hint, setHint] = useState(false)
  const [result, setResult] = useState<boolean | null>(null)
  const [message] = useState(() => ({ ok: praise(), wrong: cheer() }))
  const solvable = grid.path.length === target.length && target.length > 0

  function pick(i: number) {
    if (result !== null) return
    const last = selected[selected.length - 1]
    if (i === last) setSelected(selected.slice(0, -1))
    else if (!selected.length || (adjacent(last, i) && !selected.includes(i)))
      setSelected([...selected, i])
    else setSelected([i])
  }

  const built = selected.map((i) => grid.cells[i]).join('')
  const cellClass = (i: number) => {
    if (result !== null && grid.path.includes(i))
      return result ? ' is-found' : ' is-answer'
    if (selected.includes(i)) return ' is-selected'
    if (hint && i === grid.path[0]) return ' is-hint'
    return ''
  }

  return (
    <div className="ex">
      <Heading
        title="Найди слово"
        hint="Найдите английское слово в сетке: оно идёт по горизонтали, вертикали или «змейкой» с поворотами под прямым углом."
      />
      <div className="ex-prompt">
        <span className="ex-picture" aria-hidden="true">
          <ImageIcon size={28} />
        </span>
        <strong>{word.translation}</strong>
        <button
          type="button"
          className="ex-speak ex-speak--large"
          aria-label="Прослушать слово"
          onClick={() => void playWordAudio(word.word)}
        >
          <Volume2 size={30} />
        </button>
      </div>
      <div className="fw-layout">
        <div
          className="fw-grid"
          style={{ '--cols': COLS } as CSSProperties}
          role="grid"
          aria-label="Сетка букв"
        >
          {grid.cells.map((ch, i) => (
            <button
              key={i}
              type="button"
              className={`fw-cell${cellClass(i)}`}
              aria-pressed={selected.includes(i)}
              onClick={() => pick(i)}
            >
              {ch.toUpperCase()}
            </button>
          ))}
        </div>
        <aside className="fw-hints">
          <h3>Подсказка</h3>
          <button
            type="button"
            disabled={hint || result !== null || !solvable}
            onClick={() => {
              setHint(true)
              onPenalty(60)
            }}
          >
            <Search size={18} />
            <span>
              Показать первую букву
              <small>+1 минута к времени</small>
            </span>
          </button>
          <p className="caption">
            Выделено: <b>{built.toUpperCase() || '—'}</b>
          </p>
        </aside>
      </div>
      {result !== null && (
        <p ref={reveal} className={`ex-feedback ${result ? 'is-ok' : 'is-wrong'}`} role="status">
          <span>
            <strong>{result ? message.ok : message.wrong}</strong>
            {!result && <span> Правильно: <b>{bareTerm(word.word)}</b></span>}
          </span>
        </p>
      )}
      <div className="ex-actions">
        {result === null ? (
          <>
            <button
              type="button"
              className="button-primary"
              disabled={!selected.length}
              onClick={() => setResult(built === target)}
            >
              Проверить <ArrowRight size={18} />
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={!selected.length}
              onClick={() => setSelected(selected.slice(0, -1))}
            >
              <RotateCcw size={16} /> Отменить
            </button>
            <button type="button" className="button-secondary" onClick={onSkip}>
              <SkipForward size={16} /> Пропустить
            </button>
          </>
        ) : (
          <button type="button" className="button-primary" onClick={() => onAnswer(result)}>
            Дальше <ArrowRight size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

/* ——— Собери пару ——— */
const PAIRS_PER_STEP = 6

// Steps of roughly equal size, at most six pairs each.
function steps(words: VocabWord[]) {
  const list = shuffle(words)
  const count = Math.max(1, Math.ceil(list.length / PAIRS_PER_STEP))
  const size = Math.ceil(list.length / count)
  return Array.from({ length: count }, (_, k) => list.slice(k * size, (k + 1) * size)).filter(
    (s) => s.length,
  )
}

export function MatchPairsFormat({
  words,
  onAnswers,
  onActive,
}: {
  words: VocabWord[]
  onAnswers: (results: GameResult[]) => void
  onActive: (ids: string[]) => void
}) {
  const [plan] = useState(() => steps(words))
  const [step, setStep] = useState(0)
  const chunk = plan[step] || []
  const [right] = useState(() => plan.map((s) => shuffle(s)))
  const [links, setLinks] = useState<[string, string][]>([])
  const [pick, setPick] = useState<{ side: 'left' | 'right'; id: string } | null>(null)
  const [checked, setChecked] = useState(false)
  const [verdict, setVerdict] = useState('')
  const board = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<{ d: string; state: string }[]>([])

  useEffect(() => {
    onActive(chunk.map((w) => w.id))
    // a new step activates its words
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const leftOf = (rightId: string) => links.find(([, r]) => r === rightId)?.[0]
  const rightOf = (leftId: string) => links.find(([l]) => l === leftId)?.[1]

  function link(leftId: string, rightId: string) {
    setLinks([
      ...links.filter(([l, r]) => l !== leftId && r !== rightId),
      [leftId, rightId],
    ])
    setPick(null)
  }

  function choose(side: 'left' | 'right', id: string) {
    if (checked) return
    if (!pick || pick.side === side) {
      setPick(pick?.id === id ? null : { side, id })
      return
    }
    if (side === 'right') link(pick.id, id)
    else link(id, pick.id)
  }

  // Curves between linked words, measured from the rendered buttons.
  useLayoutEffect(() => {
    const draw = () => {
      const root = board.current
      if (!root) return
      const box = root.getBoundingClientRect()
      setLines(
        links.flatMap(([l, r]) => {
          const a = root.querySelector(`[data-left="${l}"]`)?.getBoundingClientRect()
          const b = root.querySelector(`[data-right="${r}"]`)?.getBoundingClientRect()
          if (!a || !b) return []
          const x1 = a.right - box.left
          const y1 = a.top + a.height / 2 - box.top
          const x2 = b.left - box.left
          const y2 = b.top + b.height / 2 - box.top
          const mid = (x1 + x2) / 2
          return [
            {
              d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`,
              state: checked ? (l === r ? 'is-ok' : 'is-wrong') : '',
            },
          ]
        }),
      )
    }
    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [links, checked, step])

  function finishStep(results: GameResult[]) {
    onAnswers(results)
    setLinks([])
    setPick(null)
    setChecked(false)
    setStep(step + 1)
  }

  const allLinked = chunk.every((w) => rightOf(w.id))
  return (
    <div className="ex">
      <Heading
        title="Собери пару"
        hint={`Соедините английские слова с их переводом.${plan.length > 1 ? ` Шаг ${step + 1} из ${plan.length}.` : ''}`}
      />
      <div className="mp-board" ref={board}>
        <svg className="mp-lines" aria-hidden="true">
          {lines.map((line, k) => (
            <path key={k} d={line.d} className={line.state} />
          ))}
        </svg>
        <div className="mp-col">
          {chunk.map((w) => {
            const linked = rightOf(w.id)
            const state = checked
              ? linked === w.id
                ? ' is-ok'
                : ' is-wrong'
              : pick?.side === 'left' && pick.id === w.id
                ? ' is-picked'
                : linked
                  ? ' is-linked'
                  : ''
            return (
              <button
                key={w.id}
                type="button"
                data-left={w.id}
                className={`mp-item${state}`}
                onClick={() => choose('left', w.id)}
              >
                <span>{w.word}</span>
                <span className="mp-dot" aria-hidden="true" />
              </button>
            )
          })}
        </div>
        <div className="mp-col">
          {(right[step] || []).map((w) => {
            const linked = leftOf(w.id)
            const state = checked
              ? linked === w.id
                ? ' is-ok'
                : linked
                  ? ' is-wrong'
                  : ''
              : pick?.side === 'right' && pick.id === w.id
                ? ' is-picked'
                : linked
                  ? ' is-linked'
                  : ''
            return (
              <button
                key={w.id}
                type="button"
                data-right={w.id}
                className={`mp-item mp-item--right${state}`}
                onClick={() => choose('right', w.id)}
              >
                <span className="mp-dot" aria-hidden="true" />
                <span>{w.translation}</span>
              </button>
            )
          })}
        </div>
      </div>
      {checked && (
        <p
          ref={reveal}
          className={`ex-feedback ${chunk.every((w) => rightOf(w.id) === w.id) ? 'is-ok' : 'is-wrong'}`}
          role="status"
        >
          <strong>{verdict}</strong>
        </p>
      )}
      <div className="ex-actions">
        {!checked ? (
          <>
            <button
              type="button"
              className="button-primary"
              disabled={!allLinked}
              onClick={() => {
                const right = chunk.filter((w) => rightOf(w.id) === w.id).length
                setVerdict(
                  right === chunk.length
                    ? praise()
                    : `Верно ${right} из ${chunk.length}. ${cheer()}`,
                )
                setChecked(true)
              }}
            >
              Проверить <ArrowRight size={18} />
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={!links.length}
              onClick={() => setLinks(links.slice(0, -1))}
            >
              <RotateCcw size={16} /> Отменить
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() =>
                finishStep(chunk.map((w) => ({ wordId: w.id, correct: false, skipped: true })))
              }
            >
              <SkipForward size={16} /> Пропустить
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button-primary"
            onClick={() =>
              finishStep(chunk.map((w) => ({ wordId: w.id, correct: rightOf(w.id) === w.id })))
            }
          >
            Дальше <ArrowRight size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

/* ——— Мемория ——— */
const BOARD = 12

type Card = { key: string; wordId: string; side: 'en' | 'ru'; text: string }

const cardsOf = (w: VocabWord): Card[] => [
  { key: `${w.id}:en`, wordId: w.id, side: 'en', text: bareTerm(w.word) },
  { key: `${w.id}:ru`, wordId: w.id, side: 'ru', text: w.translation },
]

/** Card back: the Padma lotus on a glassy blue tile. */
function Lotus() {
  return (
    <svg viewBox="0 0 64 48" className="mm-lotus" aria-hidden="true">
      <path d="M32 5c6.5 8 8.5 18.5 0 31-8.5-12.5-6.5-23 0-31z" />
      <path d="M32 36c-8-3.5-15.5-10-17.5-22 8 2 14 8.5 17.5 22z" />
      <path d="M32 36c8-3.5 15.5-10 17.5-22-8 2-14 8.5-17.5 22z" />
      <path d="M30 38.5c-10 2-20-1.5-26.5-12 8.5-2 18.5 2 26.5 12z" />
      <path d="M34 38.5c10 2 20-1.5 26.5-12-8.5-2-18.5 2-26.5 12z" />
      <path d="M14 43c11 3.5 25 3.5 36 0" />
    </svg>
  )
}

export function MemoryFormat({
  words,
  onAnswers,
  onActive,
  sideSlot,
}: {
  words: VocabWord[]
  onAnswers: (results: GameResult[]) => void
  onActive: (ids: string[]) => void
  sideSlot: HTMLElement | null
}) {
  const [order] = useState(() => shuffle(words))
  const total = order.length
  const [board, setBoard] = useState<(Card | null)[]>(() =>
    shuffle(order.slice(0, BOARD / 2).flatMap(cardsOf)),
  )
  const [queue, setQueue] = useState(() => order.slice(BOARD / 2))
  const [open, setOpen] = useState<string[]>([])
  const [matched, setMatched] = useState<string[]>([])
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [startedAt] = useState(() => Date.now())
  const [seconds, setSeconds] = useState(0)
  const [record, setRecord] = useState<TrainerRecord | null>(null)
  const done = matched.length === total

  useEffect(() => {
    fetchRecord('memory').then(setRecord).catch(() => {})
  }, [])
  useEffect(() => {
    if (done) return
    const timer = window.setInterval(
      () => setSeconds(Math.round((Date.now() - startedAt) / 1000)),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [done, startedAt])
  useEffect(() => {
    onActive(
      board.filter((c): c is Card => !!c && !matched.includes(c.wordId)).map((c) => c.wordId),
    )
    // board changes decide which words are in play
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, matched])

  function flash(text: string, ok: boolean) {
    setToast({ text, ok })
    window.setTimeout(() => setToast(null), 1100)
  }

  function finish(wordId: string) {
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    setSeconds(elapsed)
    saveRecord('memory', elapsed)
      .then((r) => {
        setRecord(r)
        if (r.improved) flash('Новый рекорд!', true)
      })
      .catch(() => {})
      .finally(() => window.setTimeout(() => onAnswers([{ wordId, correct: true }]), 1300))
  }

  function flip(card: Card) {
    if (busy || done || open.includes(card.key) || matched.includes(card.wordId)) return
    speakText(card.text, card.side === 'en' ? 'en-GB' : 'ru-RU')
    const next = [...open, card.key]
    setOpen(next)
    if (next.length < 2) return
    const first = board.find((c) => c?.key === next[0])!
    if (first.wordId === card.wordId) {
      flash('Идеальная пара!', true)
      const nowMatched = [...matched, card.wordId]
      setMatched(nowMatched)
      setOpen([])
      if (nowMatched.length === total) return finish(card.wordId)
      onAnswers([{ wordId: card.wordId, correct: true }])
      if (!queue.length) return
      // Found cards leave the board; the next pair takes their places
      // and is swapped with random face-down cards.
      setBusy(true)
      window.setTimeout(() => {
        const [nextWord, ...rest] = queue
        const fresh = cardsOf(nextWord)
        const updated = board.map((c) =>
          c?.wordId === card.wordId ? fresh.shift()! : c,
        )
        for (const placed of cardsOf(nextWord)) {
          const at = updated.findIndex((c) => c?.key === placed.key)
          const hidden = updated
            .map((c, i) => (c && !nowMatched.includes(c.wordId) ? i : -1))
            .filter((i) => i >= 0 && i !== at)
          const swap = hidden[Math.floor(Math.random() * hidden.length)]
          if (swap !== undefined) [updated[at], updated[swap]] = [updated[swap], updated[at]]
        }
        setBoard(updated)
        setQueue(rest)
        setBusy(false)
      }, 900)
      return
    }
    flash('Попробуй ещё раз', false)
    setBusy(true)
    window.setTimeout(() => {
      setOpen([])
      setBusy(false)
    }, 900)
  }

  const percent = total ? Math.round((matched.length / total) * 100) : 0
  const side = (
    <section className="glass-panel mm-side">
      <h2>Ваш прогресс</h2>
      <div className="mm-side__body">
        <span className="mm-ring" style={{ '--percent': percent } as CSSProperties}>
          <strong>{percent}%</strong>
        </span>
        <dl>
          <div>
            <dt>Найдено пар</dt>
            <dd>
              {matched.length} из {total}
            </dd>
          </div>
          <div>
            <dt>Время</dt>
            <dd>{clock(seconds)}</dd>
          </div>
          <div>
            <dt>
              Лучшее время <Crown size={14} aria-hidden="true" />
            </dt>
            <dd>{record?.best ? clock(record.best) : '—'}</dd>
          </div>
          <div>
            <dt>
              Ваше место <Trophy size={14} aria-hidden="true" />
            </dt>
            <dd>{record?.rank ? `${record.rank} из ${record.total}` : '—'}</dd>
          </div>
        </dl>
      </div>
    </section>
  )

  return (
    <div className="ex">
      <Heading title="Мемория" hint="Найдите пары: слово и его перевод." />
      <span className="mm-found">
        Открыто пар: {matched.length} из {total}
      </span>
      <div className="mm-grid">
        {board.map((card, i) =>
          card ? (
            <button
              key={card.key}
              type="button"
              className={`mm-card${open.includes(card.key) || matched.includes(card.wordId) ? ' is-open' : ''}${matched.includes(card.wordId) ? ' is-matched' : ''}`}
              aria-label={
                open.includes(card.key) || matched.includes(card.wordId)
                  ? card.text
                  : 'Закрытая карта'
              }
              onClick={() => flip(card)}
            >
              <span className="mm-card__back">
                <Lotus />
              </span>
              <span className={`mm-card__face mm-card__face--${card.side}`}>{card.text}</span>
            </button>
          ) : (
            <span key={`empty-${i}`} className="mm-card is-empty" />
          ),
        )}
        {toast && (
          <p className={`mm-toast${toast.ok ? ' is-ok' : ''}`} role="status">
            {toast.text}
          </p>
        )}
      </div>
      <div className="ex-actions">
        <button
          type="button"
          className="button-secondary"
          disabled={done}
          onClick={() =>
            onAnswers(
              order
                .filter((w) => !matched.includes(w.id))
                .map((w) => ({ wordId: w.id, correct: false, skipped: true })),
            )
          }
        >
          <SkipForward size={16} /> Пропустить
        </button>
      </div>
      {sideSlot && createPortal(side, sideSlot)}
    </div>
  )
}
