import { api, ApiError } from '../api'
import type { ExerciseType, VocabWord, WordStatus } from './types'

// Textbook dictionary for students (/api/lexicon/me/*). Words enter the
// trainer as VocabWord with ids "lx:<termId>" so they never clash with the
// teacher's word bank.

export type LexiconProgress = { total: number; mastered: number; percent: number }
export type StudentTopic = {
  id: string
  title: string
  description: string
  kind: 'main' | 'lexical'
  termCount: number
  subtopicCount: number
  progress: LexiconProgress
}
export type StudentSubtopic = {
  id: string
  title: string
  level: string
  termCount: number
  progress: LexiconProgress
}
export type StudentTopicDetail = Omit<StudentTopic, 'subtopicCount'> & {
  subtopics: StudentSubtopic[]
}
export type StudentWord = {
  id: string
  term: string
  translation: string
  transcription: string
  sentence: string
  sentenceTranslation: string
  pos: string
  category: string
  level: string
  status: WordStatus
}
export type StudentSubtopicWords = {
  id: string
  title: string
  topicId: string
  topicTitle: string
  words: StudentWord[]
  progress: LexiconProgress
}
export type LexiconBook = { id: string; title: string; level: string }
/** Homework still on the student's side, usable as a trainer set. */
export type HomeworkSet = {
  id: string
  title: string
  due: string
  status: 'todo' | 'returned'
  wordCount: number
}
export type HomeworkWords = { id: string; title: string; words: StudentWord[] }
export type SearchUnit = {
  id: string
  number: number
  title: string
  level: string
  topicId: string | null
  subtopicId: string | null
}
export type SearchTerm = {
  id: string
  term: string
  translation: string
  transcription: string
  units: SearchUnit[]
}

const PREFIX = 'lx:'
export const isLexiconWordId = (id: string) => id.startsWith(PREFIX)

export const toVocabWord = (w: StudentWord, subtopicId: string): VocabWord => ({
  id: PREFIX + w.id,
  word: w.term,
  transcription: w.transcription,
  translation: w.translation,
  pos: w.pos,
  level: w.level,
  exampleEn: w.sentence,
  exampleRu: w.sentenceTranslation,
  relatedIds: [],
  topicId: '',
  subtopicId,
  lessonIds: [],
})

const levelQuery = (bookId: string) =>
  bookId ? `?bookId=${encodeURIComponent(bookId)}` : ''

export const fetchTopics = (bookId = '') =>
  api<StudentTopic[]>(`/lexicon/me/topics${levelQuery(bookId)}`)
export const fetchTopic = (id: string, bookId = '') =>
  api<StudentTopicDetail>(
    `/lexicon/me/topics/${encodeURIComponent(id)}${levelQuery(bookId)}`,
  )
export const fetchSubtopic = (id: string) =>
  api<StudentSubtopicWords>(`/lexicon/me/subtopics/${encodeURIComponent(id)}`)
export const fetchBooks = () => api<LexiconBook[]>('/lexicon/books')
export const fetchHomeworkSets = () =>
  api<HomeworkSet[]>('/lexicon/me/homework')
export const fetchHomeworkWords = (id: string) =>
  api<HomeworkWords>(`/lexicon/me/homework/${encodeURIComponent(id)}/words`)
export const searchTerms = (q: string) =>
  api<{ items: SearchTerm[] }>(
    `/lexicon/search?limit=12&q=${encodeURIComponent(q)}`,
  ).then((r) => r.items)

// Trainer answers are sent in small batches. Each answer has its own id, so
// a resend after a network error counts once.
export type AnswerMeta = {
  format: ExerciseType
  sessionId: string
  sourceType: string
  sourceId: string
  sourceLabel: string
  skipped?: boolean
  hinted?: boolean
}
type Attempt = AnswerMeta & {
  id: string
  termId: string
  correct: boolean
  at: string
}
let queue: Attempt[] = []
let timer = 0
let sending = false
function flush() {
  timer = 0
  if (!queue.length || sending) return
  sending = true
  const batch = queue.slice(0, 200)
  const drop = () => {
    const sent = new Set(batch.map((a) => a.id))
    queue = queue.filter((a) => !sent.has(a.id))
  }
  api('/lexicon/me/progress', 'POST', { results: batch })
    .then(drop)
    .catch((e) => {
      // A rejected batch (words gone from the dictionary) is not retried;
      // network errors keep it for the next answer.
      if (e instanceof ApiError && e.status === 400) drop()
    })
    .finally(() => {
      sending = false
    })
}
export function reportLexiconAnswer(
  wordId: string,
  correct: boolean,
  meta: AnswerMeta,
) {
  if (!isLexiconWordId(wordId)) return
  queue.push({
    ...meta,
    id: crypto.randomUUID(),
    termId: wordId.slice(PREFIX.length),
    correct,
    at: new Date().toISOString(),
  })
  if (!timer) timer = window.setTimeout(flush, 400)
}
/** Waits (up to ~3 s) until the answers given so far reach the server. */
export async function answersSent() {
  for (let i = 0; i < 20 && queue.length; i++) {
    if (!sending && !timer) flush()
    await new Promise((r) => setTimeout(r, 150))
  }
}

export type SkillKey = 'comprehension' | 'recall' | 'listening' | 'writing'
export type SkillSuccess = {
  value: number | null
  words: number
  attempts: number
  lowSample: boolean
}
export type WordMetrics = {
  timeZone: string
  today: string
  from: string
  days: number
  words: { mastered: number; reviewing: number; learning: number }
  newWords: number
  streak: { current: number; today: boolean }
  activity: { day: string; attempts: number; words: number }[]
  skills: Record<SkillKey, SkillSuccess>
  revisit: {
    id: string
    term: string
    translation: string
    transcription: string
    mastery: number
    status: WordStatus
  }[]
}
export type MetricsSource = {
  type: 'homework' | 'collection' | 'topic'
  id: string
  label: string
}
export const PERIOD_LABELS: Record<number, string> = {
  7: 'за 7 дней',
  28: 'за 4 недели',
  90: 'за 3 месяца',
}
export const fetchMyMetrics = (days = 7) =>
  api<WordMetrics>(`/lexicon/me/metrics?days=${days}`)
export const fetchStudentMetrics = (
  studentId: string,
  days: number,
  source: string,
) =>
  api<WordMetrics & { sources: MetricsSource[] }>(
    `/lexicon/students/${encodeURIComponent(studentId)}/metrics?days=${days}${
      source ? `&source=${encodeURIComponent(source)}` : ''
    }`,
  )

const LEVEL_KEY = 'padma-lexicon-level'
export function savedLevel() {
  try {
    return localStorage.getItem(LEVEL_KEY) || ''
  } catch {
    return ''
  }
}
export function saveLevel(bookId: string) {
  try {
    localStorage.setItem(LEVEL_KEY, bookId)
  } catch {
    /* per-device convenience only */
  }
}

export type TrainerRecord = {
  best: number | null
  improved: boolean
  rank: number | null
  total: number
}
export const fetchRecord = (format: string) =>
  api<TrainerRecord>(`/lexicon/me/records/${format}`)
export const saveRecord = (format: string, seconds: number) =>
  api<TrainerRecord>(`/lexicon/me/records/${format}`, 'POST', { seconds })
