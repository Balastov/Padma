import type { WordStatus } from './types'
import { seed } from './mock/seed'

const KEY = 'padma-word-progress'

type ProgressMap = Record<string, WordStatus>

function load(): ProgressMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as ProgressMap
  } catch {
    /* ignore */
  }
  const initial: ProgressMap = {}
  for (const w of seed.words) {
    if (seed.revisitWordIds.includes(w.id)) initial[w.id] = 'reviewing'
    else if (w.id === 'w-ticket' || w.id === 'w-luggage') initial[w.id] = 'new'
    else if (w.lessonIds.includes('vl-12')) initial[w.id] = 'mastered'
    else initial[w.id] = 'learning'
  }
  initial['w-departure'] = 'reviewing'
  initial['w-ticket'] = 'new'
  initial['w-book'] = 'mastered'
  return initial
}

function save(map: ProgressMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

let cache = load()

export function getWordStatus(wordId: string): WordStatus {
  return cache[wordId] || 'new'
}

export function setWordStatus(wordId: string, status: WordStatus) {
  cache = { ...cache, [wordId]: status }
  save(cache)
}

export function bumpWordFromAnswer(wordId: string, correct: boolean) {
  const cur = getWordStatus(wordId)
  if (!correct) {
    setWordStatus(wordId, cur === 'new' ? 'learning' : 'reviewing')
    return
  }
  if (cur === 'new') setWordStatus(wordId, 'learning')
  else if (cur === 'learning') setWordStatus(wordId, 'reviewing')
  else if (cur === 'reviewing') setWordStatus(wordId, 'mastered')
}

export function progressCounts() {
  const values = Object.values(cache)
  return {
    mastered: values.filter((s) => s === 'mastered').length,
    reviewing: values.filter((s) => s === 'reviewing').length,
    learning: values.filter((s) => s === 'learning').length,
    neu: values.filter((s) => s === 'new').length,
  }
}

export function statusLabel(status: WordStatus) {
  if (status === 'mastered') return 'Освоено'
  if (status === 'reviewing') return 'Закрепляется'
  if (status === 'learning') return 'Изучается'
  return 'Новое'
}

export function revisitWords() {
  return seed.words.filter(
    (w) => getWordStatus(w.id) === 'reviewing' || seed.revisitWordIds.includes(w.id),
  )
}
