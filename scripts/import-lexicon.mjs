import { readFileSync } from 'node:fs'
import { openStore } from '../server/store.mjs'
import { readXlsx } from '../server/xlsx.mjs'
import { initLexicon, importLexicon } from '../server/lexicon.mjs'

// Usage: npm run import:lexicon -- /path/to/lexicon.xlsx [--replace]
const args = process.argv.slice(2)
const path = args.find((arg) => !arg.startsWith('--'))
if (!path) {
  console.error('Укажите путь к XLSX: npm run import:lexicon -- файл.xlsx')
  process.exit(1)
}
const rows = readXlsx(readFileSync(path))
const db = openStore(process.env.PADMA_DB || '.data/padma.sqlite')
try {
  initLexicon(db)
  const stats = importLexicon(db, rows, { replace: args.includes('--replace') })
  console.log(
    `Импортировано: учебников ${stats.books}, юнитов ${stats.units}, терминов ${stats.terms}, вхождений ${stats.occurrences}`,
  )
  console.log(
    `Пропущено дублей: ${stats.duplicates}; вхождений без транскрипции: ${stats.withoutTranscription}`,
  )
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  db.close()
}
