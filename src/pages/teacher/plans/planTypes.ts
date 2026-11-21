import type { LexiconTerm } from '../../../components/LexiconPicker'
import type { StoredFile } from '../../../files'

export type PlanSlot = { id: string; date: string; start: string; end: string }
export type PlanLexiconSource = {
  kind: 'topic' | 'subtopic' | 'search'
  id: string
  title: string
  parentTitle: string
  words: LexiconTerm[]
}
export type PlanStep = {
  id: string
  blockId: string
  /** Number of the lesson in the whole plan. */
  number: number
  title: string
  homework: string
  lexicon: PlanLexiconSource[]
  grammar: { id: string; title: string }[]
  files: StoredFile[]
  /** Student plan: the lesson has passed (homework given unless empty). */
  issue: { homeworkId: string; issued: string; lesson: PlanSlot | null } | null
  /** Student plan: the scheduled lesson this plan lesson is expected at. */
  lesson: PlanSlot | null
}
export type PlanBlock = { id: string; title: string; lessons: PlanStep[] }
export type Plan = {
  id: string
  title: string
  authorId: string
  /** null for a program (template). */
  studentId: string | null
  sourceId: string
  startDate: string
  updated: string
  canEdit: boolean
  blocks: PlanBlock[]
  /** Id of the block or lesson just created. */
  createdId?: string
}
export type PlanSummary = {
  id: string
  title: string
  authorId: string
  studentId: string | null
  startDate: string
  updated: string
  canEdit: boolean
  blockCount: number
  lessonCount: number
  passed: number
}

export function countLabel(n: number, forms: [string, string, string]) {
  const tail = n % 100
  const form =
    tail % 10 === 1 && tail !== 11
      ? forms[0]
      : tail % 10 >= 2 && tail % 10 <= 4 && (tail < 12 || tail > 14)
        ? forms[1]
        : forms[2]
  return `${n} ${form}`
}
export const lessonsLabel = (n: number) =>
  countLabel(n, ['урок', 'урока', 'уроков'])
export const blocksLabel = (n: number) =>
  countLabel(n, ['блок', 'блока', 'блоков'])
