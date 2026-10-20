import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  ImageIcon,
  Lightbulb,
  Play,
  RotateCcw,
  Shuffle,
  SkipForward,
  Smile,
  Frown,
  Volume2,
  XCircle,
} from 'lucide-react'
import type { VocabWord } from '../../student/types'
import { playExampleAudio, playWordAudio } from '../../student/audio'
import {
  assembleTarget,
  assembleWords,
  bareTerm,
  cheer,
  posLabel,
  praise,
  reveal,
  shuffle,
} from './exerciseUtils'
import './exercises.css'

type Answer = (correct: boolean) => void

const speakWord = (w: VocabWord) => void playWordAudio(w.word)

/** Picture slot of a word: placeholder until pictures are uploaded. */
function Picture() {
  return (
    <span className="ex-picture" aria-hidden="true">
      <ImageIcon size={28} />
    </span>
  )
}

function Speak({
  label,
  onPlay,
  large,
}: {
  label: string
  onPlay: () => void
  large?: boolean
}) {
  return (
    <button
      type="button"
      className={`ex-speak${large ? ' ex-speak--large' : ''}`}
      aria-label={label}
      onClick={onPlay}
    >
      <Volume2 size={large ? 30 : 18} />
    </button>
  )
}

function Highlighted({ text, term }: { text: string; term: string }) {
  const bare = bareTerm(term)
  const at = bare ? text.toLowerCase().indexOf(bare.toLowerCase()) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + bare.length)}</mark>
      {text.slice(at + bare.length)}
    </>
  )
}

function Heading({ title, hint }: { title: string; hint: string }) {
  return (
    <header className="ex-heading">
      <h2>{title}</h2>
      <p className="secondary">{hint}</p>
    </header>
  )
}

/** Praise for a right answer, the correct one and good luck otherwise. */
function Feedback({ ok, correct }: { ok: boolean; correct?: ReactNode }) {
  const [text] = useState(() => (ok ? praise() : cheer()))
  return (
    <p ref={reveal} className={`ex-feedback ${ok ? 'is-ok' : 'is-wrong'}`} role="status">
      {ok ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
      <span>
        <strong>{text}</strong>
        {!ok && correct && <span> Правильно: {correct}</span>}
      </span>
    </p>
  )
}

function SkipButton({ onSkip }: { onSkip: () => void }) {
  return (
    <button type="button" className="button-secondary" onClick={onSkip}>
      <SkipForward size={16} /> Пропустить
    </button>
  )
}

function NextButton({ onNext }: { onNext: () => void }) {
  return (
    <button type="button" className="button-primary" onClick={onNext}>
      Дальше <ArrowRight size={18} />
    </button>
  )
}

/** Words for wrong options: other translations of the session. */
function distractors(word: VocabWord, pool: VocabWord[], count: number) {
  const seen = new Set([word.translation.toLowerCase()])
  const result: string[] = []
  for (const w of shuffle(pool)) {
    const t = w.translation.trim()
    if (!t || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    result.push(t)
    if (result.length === count) break
  }
  return result
}

/* ——— Карточки со словами ——— */
export function CardsFormat({ word, onAnswer }: { word: VocabWord; onAnswer: Answer }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="ex">
      <Heading
        title="Карточки со словами"
        hint="Посмотрите на слово, послушайте его и пример, затем откройте перевод."
      />
      <article className="ex-card">
        <div className="ex-card__top">
          <div className="ex-card__word">
            <h3>{word.word}</h3>
            <div className="ex-card__line">
              {word.transcription && (
                <span className="ex-ipa">/{word.transcription}/</span>
              )}
              <Speak label={`Произношение: ${word.word}`} onPlay={() => speakWord(word)} />
            </div>
            {word.pos && <span className="ex-pill">{posLabel(word.pos)}</span>}
          </div>
          <Picture />
        </div>
        {word.exampleEn && (
          <div className="ex-card__example">
            <p>
              <Highlighted text={word.exampleEn} term={word.word} />
            </p>
            <Speak label="Прослушать пример" onPlay={() => playExampleAudio(word.exampleEn)} />
            {word.exampleRu && <p className="secondary">{word.exampleRu}</p>}
          </div>
        )}
      </article>
      <button
        type="button"
        className={`ex-reveal${shown ? ' is-shown' : ''}`}
        onClick={() => setShown(true)}
        aria-live="polite"
      >
        {shown ? (
          <strong>{word.translation}</strong>
        ) : (
          <>
            <Eye size={18} aria-hidden="true" /> Здесь появится перевод
          </>
        )}
      </button>
      <div className="ex-actions">
        <button
          type="button"
          className="button-secondary"
          disabled={shown}
          onClick={() => setShown(true)}
        >
          <Eye size={16} /> Показать перевод
        </button>
        <button type="button" className="button-primary" onClick={() => onAnswer(true)}>
          Следующее <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}

/* ——— Тренировочные карточки ——— */
export function TrainingCardsFormat({
  word,
  onAnswer,
  onSkip,
}: {
  word: VocabWord
  onAnswer: Answer
  onSkip: () => void
}) {
  const [shown, setShown] = useState(false)
  return (
    <div className="ex">
      <Heading
        title="Тренировочные карточки"
        hint="Вспомните значение слова, а затем оцените, насколько хорошо вы его помните."
      />
      <article className="ex-card ex-card--center">
        <span className="ex-chip">
          <Eye size={16} aria-hidden="true" /> Посмотрите на слово
        </span>
        <div className="ex-card__title">
          <h3 className="ex-big">{word.word}</h3>
          <Speak large label={`Произношение: ${word.word}`} onPlay={() => speakWord(word)} />
        </div>
        {word.transcription && <p className="ex-ipa ex-ipa--big">/{word.transcription}/</p>}
        {word.pos && <span className="ex-pill">{posLabel(word.pos)}</span>}
      </article>
      <p className="ex-tip">
        <Lightbulb size={18} aria-hidden="true" /> Вспомните значение слова, а затем
        оцените, насколько хорошо вы его помните.
      </p>
      <div className="ex-rate">
        <button type="button" className="ex-rate__easy" onClick={() => onAnswer(true)}>
          <Smile size={22} /> Легко
        </button>
        <button type="button" className="ex-rate__hard" onClick={() => onAnswer(false)}>
          <Frown size={22} /> Сложно
        </button>
        <button type="button" className="ex-rate__skip" onClick={onSkip}>
          <SkipForward size={22} /> Пропустить
        </button>
      </div>
      <button
        type="button"
        className={`ex-reveal${shown ? ' is-shown' : ''}`}
        onClick={() => setShown(true)}
        aria-live="polite"
      >
        {shown ? (
          <strong>{word.translation}</strong>
        ) : (
          <>
            <Eye size={18} aria-hidden="true" /> Показать перевод
          </>
        )}
      </button>
    </div>
  )
}

/* ——— Собери слово (и аудио) ——— */
export function AssembleFormat({
  word,
  audioOnly,
  onAnswer,
  onSkip,
}: {
  word: VocabWord
  audioOnly: boolean
  onAnswer: Answer
  onSkip: () => void
}) {
  const target = useMemo(() => assembleTarget(word.word), [word.word])
  // Slot groups follow the words of a multi-word expression.
  const groups = useMemo(
    () => assembleWords(word.word).map((part) => part.length),
    [word.word],
  )
  const [tiles, setTiles] = useState(() =>
    shuffle([...target].map((ch, i) => ({ id: i, ch }))),
  )
  const [placed, setPlaced] = useState<number[]>([])
  const [result, setResult] = useState<boolean | null>(null)
  const built = placed.map((id) => tiles.find((t) => t.id === id)!.ch).join('')

  useEffect(() => {
    if (audioOnly) speakWord(word)
  }, [audioOnly, word])

  function check() {
    setResult(built === target)
  }

  let slot = 0
  return (
    <div className="ex">
      <Heading
        title={audioOnly ? 'Собери слово · аудио' : 'Собери слово'}
        hint={
          audioOnly
            ? 'Прослушайте слово и соберите его из букв.'
            : 'Составьте английское слово из предложенных букв.'
        }
      />
      {audioOnly ? (
        <div className="ex-listen">
          <button
            type="button"
            className="ex-play"
            aria-label="Прослушать слово"
            onClick={() => speakWord(word)}
          >
            <Play size={34} />
          </button>
          <small>Нажмите, чтобы прослушать ещё раз</small>
        </div>
      ) : (
        <div className="ex-prompt">
          <Picture />
          <strong>{word.translation}</strong>
          <Speak large label="Прослушать слово" onPlay={() => speakWord(word)} />
        </div>
      )}
      <div
        className={`ex-slots${result === null ? '' : result ? ' is-ok' : ' is-wrong'}`}
        aria-label={`Собрано: ${built || 'пока ничего'}`}
      >
        {groups.map((length, g) => (
          <span key={g} className="ex-slots__word">
            {Array.from({ length }, () => {
              const i = slot++
              return (
                <span key={i} className={`ex-slot${built[i] ? ' is-filled' : ''}`}>
                  {built[i] || ''}
                </span>
              )
            })}
          </span>
        ))}
      </div>
      {result === false && <Feedback ok={false} correct={<b>{bareTerm(word.word)}</b>} />}
      {result === true && <Feedback ok />}
      <div className="ex-letters">
        {tiles.map((t) => (
          <button
            key={t.id}
            type="button"
            className="ex-letter"
            disabled={placed.includes(t.id) || result !== null}
            onClick={() => placed.length < target.length && setPlaced([...placed, t.id])}
          >
            {t.ch}
          </button>
        ))}
      </div>
      <div className="ex-actions">
        {result === null ? (
          <>
            <button
              type="button"
              className="button-primary"
              disabled={placed.length < target.length}
              onClick={check}
            >
              Проверить <ArrowRight size={18} />
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={!placed.length}
              onClick={() => setPlaced(placed.slice(0, -1))}
            >
              <RotateCcw size={16} /> Отменить
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setTiles(shuffle(tiles))}
            >
              <Shuffle size={16} /> Перемешать
            </button>
            <SkipButton onSkip={onSkip} />
          </>
        ) : (
          <NextButton onNext={() => onAnswer(result)} />
        )}
      </div>
    </div>
  )
}

/* ——— Выбери перевод (и аудио) ——— */
export function ChooseFormat({
  word,
  pool,
  audioOnly,
  onAnswer,
  onSkip,
}: {
  word: VocabWord
  pool: VocabWord[]
  audioOnly: boolean
  onAnswer: Answer
  onSkip: () => void
}) {
  const [options] = useState(() =>
    shuffle([word.translation, ...distractors(word, pool, 3)]),
  )
  const [selected, setSelected] = useState('')
  const [result, setResult] = useState<boolean | null>(null)

  useEffect(() => {
    if (audioOnly) speakWord(word)
  }, [audioOnly, word])

  return (
    <div className="ex">
      <Heading
        title={audioOnly ? 'Выбери перевод · аудио' : 'Выбери перевод'}
        hint={
          audioOnly
            ? 'Сначала прослушайте слово, затем выберите правильный перевод.'
            : 'Как это будет по-русски? Не торопитесь, вы справитесь!'
        }
      />
      {audioOnly ? (
        <div className="ex-listen">
          <button
            type="button"
            className="ex-play"
            aria-label="Прослушать слово"
            onClick={() => speakWord(word)}
          >
            <Volume2 size={34} />
          </button>
          <small>Нажмите, чтобы ещё раз прослушать</small>
        </div>
      ) : (
        <div className="ex-prompt ex-prompt--word">
          <Picture />
          <span>
            <strong className="ex-big">{word.word}</strong>
            {word.transcription && <span className="ex-ipa">/{word.transcription}/</span>}
            {word.pos && <span className="ex-pill">{posLabel(word.pos)}</span>}
          </span>
          <Speak large label={`Произношение: ${word.word}`} onPlay={() => speakWord(word)} />
        </div>
      )}
      <div className="ex-options" role="radiogroup" aria-label="Варианты перевода">
        {options.map((opt) => {
          const state =
            result === null
              ? opt === selected
                ? ' is-selected'
                : ''
              : opt === word.translation
                ? ' is-ok'
                : opt === selected
                  ? ' is-wrong'
                  : ''
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={opt === selected}
              className={`ex-option${state}`}
              disabled={result !== null}
              onClick={() => setSelected(opt)}
            >
              <span className="ex-option__dot" aria-hidden="true" />
              {opt}
            </button>
          )
        })}
      </div>
      {result !== null && <Feedback ok={result} correct={<b>{word.translation}</b>} />}
      <div className="ex-actions">
        {result === null ? (
          <>
            <button
              type="button"
              className="button-primary"
              disabled={!selected}
              onClick={() => setResult(selected === word.translation)}
            >
              Ответить <ArrowRight size={18} />
            </button>
            <SkipButton onSkip={onSkip} />
          </>
        ) : (
          <NextButton onNext={() => onAnswer(result)} />
        )}
      </div>
    </div>
  )
}

/* ——— Верно — неверно ——— */
export function TrueFalseFormat({
  word,
  pool,
  onAnswer,
  onSkip,
}: {
  word: VocabWord
  pool: VocabWord[]
  onAnswer: Answer
  onSkip: () => void
}) {
  // Half of the time the shown translation belongs to another word.
  const [shown] = useState(() => {
    const other = distractors(word, pool, 1)[0]
    return Math.random() < 0.5 || !other
      ? { text: word.translation, truth: true }
      : { text: other, truth: false }
  })
  const [choice, setChoice] = useState<boolean | null>(null)
  const [result, setResult] = useState<boolean | null>(null)

  return (
    <div className="ex">
      <Heading
        title="Верно — неверно"
        hint="Прочитайте слово и его перевод. Верно ли указан перевод?"
      />
      <article className="ex-card ex-card--center">
        <Picture />
        <div className="ex-card__title">
          <h3 className="ex-big">{word.word}</h3>
          <Speak large label={`Произношение: ${word.word}`} onPlay={() => speakWord(word)} />
        </div>
        <p className="ex-tf__translation">{shown.text}</p>
        <div className="ex-tf">
          <button
            type="button"
            className={`ex-tf__yes${choice === true ? ' is-selected' : ''}`}
            disabled={result !== null}
            aria-pressed={choice === true}
            onClick={() => setChoice(true)}
          >
            <CheckCircle2 size={22} /> Верно
          </button>
          <button
            type="button"
            className={`ex-tf__no${choice === false ? ' is-selected' : ''}`}
            disabled={result !== null}
            aria-pressed={choice === false}
            onClick={() => setChoice(false)}
          >
            <XCircle size={22} /> Неверно
          </button>
        </div>
      </article>
      {result !== null && (
        <Feedback
          ok={result}
          correct={
            <>
              «{word.word}» — это <b>{word.translation}</b>
            </>
          }
        />
      )}
      <div className="ex-actions">
        {result === null ? (
          <>
            <button
              type="button"
              className="button-primary"
              disabled={choice === null}
              onClick={() => setResult(choice === shown.truth)}
            >
              Выбрать <ArrowRight size={18} />
            </button>
            <SkipButton onSkip={onSkip} />
          </>
        ) : (
          <NextButton onNext={() => onAnswer(result)} />
        )}
      </div>
    </div>
  )
}
