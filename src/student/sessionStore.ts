import type { ExerciseType, VocabWord } from './types'

export type TrainerSession = {
  id: string
  sourceType:
    | 'all'
    | 'topic'
    | 'lesson'
    | 'collection'
    | 'revisit'
    | 'homework'
  sourceId: string
  sourceLabel: string
  exerciseType: ExerciseType
  wordIds: string[]
  currentIndex: number
  startedAt: string
  status: 'active' | 'paused' | 'done'
  answers: { wordId: string; correct: boolean; ms: number; skipped?: boolean }[]
  elapsedSec: number
  /** Snapshot of textbook dictionary words used by the session. */
  words?: VocabWord[]
  /** Leaving keeps the timer and answers (homework tied to a lesson). */
  resumable?: boolean
}

const KEY = 'padma-trainer-sessions'

function loadAll(): TrainerSession[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as TrainerSession[]
  } catch {
    /* ignore */
  }
  return []
}

function saveAll(list: TrainerSession[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export function deleteSession(id: string) {
  saveAll(loadAll().filter((s) => s.id !== id))
}

/** Local days (YYYY-MM-DD) with at least one finished training. */
export function practiceDays(): string[] {
  return [
    ...new Set(
      loadAll()
        .filter((s) => s.status === 'done')
        .map((s) => localDay(new Date(s.startedAt))),
    ),
  ].sort()
}

export const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function getSession(id: string) {
  return loadAll().find((s) => s.id === id)
}

export function getPausedSession() {
  return loadAll().find((s) => s.status === 'paused')
}

export function upsertSession(session: TrainerSession) {
  const list = loadAll().filter((s) => s.id !== session.id)
  list.push(session)
  saveAll(list)
}

export function createSession(
  input: Omit<
    TrainerSession,
    'id' | 'startedAt' | 'status' | 'answers' | 'currentIndex' | 'elapsedSec'
  > & { wordIds: string[] },
) {
  const session: TrainerSession = {
    ...input,
    id: crypto.randomUUID(),
    currentIndex: 0,
    startedAt: new Date().toISOString(),
    status: 'active',
    answers: [],
    elapsedSec: 0,
  }
  upsertSession(session)
  return session
}
