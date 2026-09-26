import type { ExerciseType } from './types'

export type TrainerSession = {
  id: string
  sourceType: 'all' | 'topic' | 'lesson' | 'collection' | 'revisit'
  sourceId: string
  sourceLabel: string
  exerciseType: ExerciseType
  wordIds: string[]
  currentIndex: number
  startedAt: string
  status: 'active' | 'paused' | 'done'
  answers: { wordId: string; correct: boolean; ms: number }[]
  elapsedSec: number
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

export function createSession(input: Omit<TrainerSession, 'id' | 'startedAt' | 'status' | 'answers' | 'currentIndex' | 'elapsedSec'> & { wordIds: string[] }) {
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
