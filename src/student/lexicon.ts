import { api } from '../api'
import type { VocabWord, WordStatus } from './types'

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

// Trainer answers are sent in small batches; a failed send is retried with
// the next answer.
let queue: { termId: string; correct: boolean }[] = []
let timer = 0
function flush() {
  timer = 0
  if (!queue.length) return
  const batch = queue.slice(0, 200)
  queue = queue.slice(batch.length)
  api('/lexicon/me/progress', 'POST', { results: batch }).catch(() => {
    queue = [...batch, ...queue]
  })
}
export function reportLexiconAnswer(wordId: string, correct: boolean) {
  if (!isLexiconWordId(wordId)) return
  queue.push({ termId: wordId.slice(PREFIX.length), correct })
  if (!timer) timer = window.setTimeout(flush, 400)
}

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
