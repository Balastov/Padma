export const wordsCount = (n: number) => {
  const tail = n % 100 > 10 && n % 100 < 20 ? 5 : n % 10
  return `${n} ${tail === 1 ? 'слово' : tail >= 2 && tail <= 4 ? 'слова' : 'слов'}`
}

export const sourceLabel = (s: {
  kind: string
  title: string
  parentTitle?: string
}) =>
  s.kind === 'subtopic'
    ? `${s.parentTitle} → ${s.title}`
    : s.kind === 'topic'
      ? `${s.title} (вся тема)`
      : s.title
