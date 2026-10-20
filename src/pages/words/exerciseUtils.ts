// Helpers shared by trainer formats.

export function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Term without sense notes "[visit]" and optional parts "(’s)". */
export const bareTerm = (term: string) =>
  term
    .replace(/\s*(\[[^\]]*\]|\([^)]*\))/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Words to assemble: letters, apostrophes and hyphens only, lower case. */
export const assembleWords = (term: string) =>
  bareTerm(term)
    .split(' ')
    .map((part) => part.toLocaleLowerCase('en').replace(/[^a-z'’-]/g, ''))
    .filter(Boolean)

export const assembleTarget = (term: string) => assembleWords(term).join('')

const POS: Record<string, string> = {
  n: 'Существительное',
  v: 'Глагол',
  adj: 'Прилагательное',
  adv: 'Наречие',
  prep: 'Предлог',
  pron: 'Местоимение',
  conj: 'Союз',
  phrase: 'Выражение',
  'phr v': 'Фразовый глагол',
  'phrasal verb': 'Фразовый глагол',
  num: 'Числительное',
  det: 'Определитель',
  interj: 'Междометие',
}
export const posLabel = (pos: string) =>
  pos
    .split('/')
    .map((p) => POS[p.trim().toLowerCase()] || p.trim())
    .filter(Boolean)
    .join(' / ')

const PRAISE = ['Отлично!', 'Верно, так держать!', 'Супер, правильно!', 'Точно в цель!']
const CHEER = [
  'Ничего страшного — в следующий раз получится!',
  'Не беда, удачи на следующем слове!',
  'Почти! Запомните — и вперёд.',
]
const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)]
export const praise = () => pick(PRAISE)
export const cheer = () => pick(CHEER)

/** Ref callback: brings an answer message into view on phones. */
export function reveal(el: HTMLElement | null) {
  el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}
