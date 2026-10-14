import { readFileSync } from 'node:fs'
import { openStore } from '../server/store.mjs'
import { readXlsxSheets } from '../server/xlsx.mjs'
import { initVocab } from '../server/vocab.mjs'
import { initLexicon } from '../server/lexicon.mjs'
import { importBook } from '../server/lexiconBook.mjs'

// Usage: npm run import:book -- /path/to/book.xlsx [--dry-run] [--book=<id>]
const args = process.argv.slice(2)
const path = args.find((arg) => !arg.startsWith('--'))
const dryRun = args.includes('--dry-run')
const bookId = args.find((arg) => arg.startsWith('--book='))?.slice(7)
if (!path) {
  console.error(
    'Укажите путь к XLSX: npm run import:book -- файл.xlsx [--dry-run] [--book=<id>]',
  )
  process.exit(1)
}
const sheets = readXlsxSheets(readFileSync(path))
const db = openStore(process.env.PADMA_DB || '.data/padma.sqlite')
try {
  initVocab(db)
  initLexicon(db)
  const r = importBook(db, sheets, { bookId, dryRun })
  const actions = { renamed: 'переименована', created: 'создана', reused: 'уже есть' }
  console.log(
    `${dryRun ? 'ПРОВЕРКА (база не изменена)' : 'Импортировано'}: ${r.book} (${r.level})`,
  )
  for (const t of r.topics)
    console.log(
      `  Тема «${t.title}» — ${actions[t.action]}${t.from && t.from !== t.title ? ` из «${t.from}»` : ''}, юнитов: ${t.units}`,
    )
  for (const t of r.levelRenames)
    console.log(`  Уровень добавлен к теме другого учебника: «${t.from}» → «${t.to}»`)
  console.log(
    `  Подтемы: создано ${r.subtopics.created}, обновлено ${r.subtopics.updated}`,
  )
  console.log(
    `  Слова: строк ${r.words.rows}, новых терминов ${r.words.newTerms}, заменено старых вхождений ${r.words.removedOccurrences}, удалено неиспользуемых терминов ${r.words.deletedTerms}`,
  )
  if (r.emptyTopics.length)
    console.log(`  Темы без юнитов и подтем: ${r.emptyTopics.join(', ')}`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  db.close()
}
