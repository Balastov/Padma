import { api } from '../api'
import type {
  Collection,
  Subtopic,
  Topic,
  VocabLesson,
  VocabWord,
} from './types'

export type VocabCatalog = {
  words: VocabWord[]
  topics: Topic[]
  subtopics: Subtopic[]
  collections: Collection[]
  lessons: VocabLesson[]
  allowedExercises: Record<string, string[]>
}

let cache: VocabCatalog | null = null
let inflight: Promise<VocabCatalog> | null = null

function mapWord(w: Record<string, unknown>): VocabWord {
  return {
    id: String(w.id),
    word: String(w.word || ''),
    transcription: String(w.transcription || ''),
    translation: String(w.translation || ''),
    pos: String(w.pos || ''),
    level: String(w.level || ''),
    exampleEn: String(w.exampleEn || ''),
    exampleRu: String(w.exampleRu || ''),
    relatedIds: Array.isArray(w.relatedIds)
      ? (w.relatedIds as string[])
      : [],
    topicId: String(w.topicId || ''),
    subtopicId: String(w.subtopicId || ''),
    lessonIds: Array.isArray(w.lessonIds) ? (w.lessonIds as string[]) : [],
  }
}

export async function loadCatalog(force = false): Promise<VocabCatalog> {
  if (cache && !force) return cache
  if (inflight && !force) return inflight
  inflight = api<Record<string, unknown>>('/vocab/me/catalog')
    .then((raw) => {
      const words = (Array.isArray(raw.words) ? raw.words : []).map((w) =>
        mapWord(w as Record<string, unknown>),
      )
      const topics = (Array.isArray(raw.topics) ? raw.topics : []).map(
        (t) => {
          const row = t as Record<string, unknown>
          return {
            id: String(row.id),
            title: String(row.title || ''),
            description: String(row.description || ''),
            kind: row.kind === 'lexical' ? 'lexical' : 'main',
            image: undefined,
            subtopicIds: Array.isArray(row.subtopicIds)
              ? (row.subtopicIds as string[])
              : [],
          } satisfies Topic
        },
      )
      const subtopics = (Array.isArray(raw.subtopics) ? raw.subtopics : []).map(
        (s) => {
          const row = s as Record<string, unknown>
          return {
            id: String(row.id),
            topicId: String(row.topicId || ''),
            title: String(row.title || ''),
            wordIds: Array.isArray(row.wordIds)
              ? (row.wordIds as string[])
              : words
                  .filter((w) => w.subtopicId === String(row.id))
                  .map((w) => w.id),
          } satisfies Subtopic
        },
      )
      const collections = (
        Array.isArray(raw.collections) ? raw.collections : []
      ).map((c) => {
        const row = c as Record<string, unknown>
        return {
          id: String(row.id),
          title: String(row.title || ''),
          description: String(row.description || ''),
          wordIds: Array.isArray(row.wordIds) ? (row.wordIds as string[]) : [],
          tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
          updated: String(row.updated || ''),
        } satisfies Collection
      })
      const lessons = (Array.isArray(raw.lessons) ? raw.lessons : []).map(
        (l) => {
          const row = l as Record<string, unknown>
          return {
            id: String(row.id),
            title: String(row.title || ''),
            date: String(row.date || ''),
            description: '',
            wordIds: Array.isArray(row.wordIds)
              ? (row.wordIds as string[])
              : [],
          } satisfies VocabLesson
        },
      )
      cache = {
        words,
        topics,
        subtopics,
        collections,
        lessons,
        allowedExercises:
          (raw.allowedExercises as Record<string, string[]>) || {},
      }
      return cache
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function getCachedCatalog(): VocabCatalog | null {
  return cache
}

export function getWord(id: string): VocabWord | undefined {
  return cache?.words.find((w) => w.id === id)
}

export function getWordsByIds(ids: string[]): VocabWord[] {
  if (!cache) return []
  return ids.map(getWord).filter(Boolean) as VocabWord[]
}

export function searchWords(q: string): VocabWord[] {
  if (!cache) return []
  const s = q.trim().toLowerCase()
  if (!s) return []
  return cache.words.filter(
    (w) =>
      w.word.toLowerCase().includes(s) ||
      w.translation.toLowerCase().includes(s) ||
      w.transcription.toLowerCase().includes(s),
  )
}

export function allowedExercisesFor(
  sourceType: string,
  sourceId: string,
): string[] | null {
  if (!cache) return null
  const key = `${sourceType}:${sourceId}`
  return cache.allowedExercises[key] || null
}
