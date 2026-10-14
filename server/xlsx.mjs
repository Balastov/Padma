import { inflateRawSync } from 'node:zlib'

// Minimal XLSX reader: worksheets as arrays of rows (string cells). Tags may
// carry a namespace prefix (<x:row>), as written by some generators.
// Supports stored/deflated zip entries; ZIP64 and encrypted files are rejected.

const MAX_ENTRY = 200 * 1024 * 1024

function unzip(buffer) {
  let eocd = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  if (eocd < 0) throw new Error('Файл не похож на XLSX (zip)')
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  if (count === 0xffff || offset === 0xffffffff)
    throw new Error('ZIP64 не поддерживается')
  const entries = new Map()
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50)
      throw new Error('Повреждённый каталог zip')
    const flags = buffer.readUInt16LE(offset + 8)
    const method = buffer.readUInt16LE(offset + 10)
    const compressed = buffer.readUInt32LE(offset + 20)
    const size = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const local = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    entries.set(name, { flags, method, compressed, size, local })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return (name) => {
    const entry = entries.get(name)
    if (!entry) return null
    if (entry.flags & 1) throw new Error('Зашифрованные XLSX не поддерживаются')
    if (entry.size > MAX_ENTRY) throw new Error('Слишком большой XLSX')
    if (buffer.readUInt32LE(entry.local) !== 0x04034b50)
      throw new Error('Повреждённый zip')
    const start =
      entry.local +
      30 +
      buffer.readUInt16LE(entry.local + 26) +
      buffer.readUInt16LE(entry.local + 28)
    const data = buffer.subarray(start, start + entry.compressed)
    if (entry.method === 0) return data.toString('utf8')
    if (entry.method === 8)
      return inflateRawSync(data, { maxOutputLength: MAX_ENTRY }).toString(
        'utf8',
      )
    throw new Error('Неподдерживаемое сжатие в XLSX')
  }
}

const decode = (value) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|quot|apos|amp);/gi, (_, code) => {
    if (code[0] === '#')
      return String.fromCodePoint(
        code[1].toLowerCase() === 'x'
          ? parseInt(code.slice(2), 16)
          : Number(code.slice(1)),
      )
    return { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }[
      code.toLowerCase()
    ]
  })

const textRuns = (xml) =>
  decode(
    [
      ...xml
        .replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '')
        .matchAll(/<(?:\w+:)?t(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g),
    ]
      .map((m) => m[1] || '')
      .join(''),
  )

const attr = (attrs, name) =>
  new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1]

const columnIndex = (ref) => {
  let index = 0
  for (const char of /^[A-Z]+/.exec(ref)?.[0] || '')
    index = index * 26 + char.charCodeAt(0) - 64
  return index - 1
}

// Sheets in workbook order: [{ name, path }].
function sheetPaths(read) {
  const workbook = read('xl/workbook.xml')
  const rels = read('xl/_rels/workbook.xml.rels') || ''
  const targets = new Map(
    [...rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)].map((m) => [
      attr(m[1], 'Id'),
      attr(m[1], 'Target'),
    ]),
  )
  const sheets = [...(workbook || '').matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>/g)]
    .map((m) => ({
      name: decode(attr(m[1], 'name') || ''),
      target: targets.get(attr(m[1], 'r:id')),
    }))
    .filter((sheet) => sheet.target)
    .map(({ name, target }) => ({
      name,
      path: target.startsWith('/') ? target.slice(1) : `xl/${target}`,
    }))
  return sheets.length
    ? sheets
    : [{ name: 'Sheet1', path: 'xl/worksheets/sheet1.xml' }]
}

function parseSheet(xml, shared) {
  const rows = []
  for (const rowMatch of xml.matchAll(
    /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g,
  )) {
    const number = Number(attr(rowMatch[1], 'r')) || rows.length + 1
    const cells = []
    for (const cell of (rowMatch[2] || '').matchAll(
      /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g,
    )) {
      const [, attrs, inner = ''] = cell
      const type = attr(attrs, 't')
      const raw = /<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner)?.[1]
      let value = ''
      if (type === 'inlineStr') value = textRuns(inner)
      else if (raw == null) value = ''
      else if (type === 's') value = shared[Number(raw)] ?? ''
      else value = decode(raw)
      const ref = attr(attrs, 'r')
      cells[ref ? columnIndex(ref) : cells.length] = value
    }
    rows.push({ number, cells: Array.from(cells, (v) => v ?? '') })
  }
  return rows
}

function sharedStrings(read) {
  return [
    ...(read('xl/sharedStrings.xml') || '').matchAll(
      /<(?:\w+:)?si(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g,
    ),
  ].map((m) => textRuns(m[1] || ''))
}

/** All worksheets: [{ name, rows }]. */
export function readXlsxSheets(buffer) {
  const read = unzip(buffer)
  const shared = sharedStrings(read)
  return sheetPaths(read).map(({ name, path }) => {
    const xml = read(path)
    if (!xml) throw new Error(`В XLSX нет листа «${name}»`)
    return { name, rows: parseSheet(xml, shared) }
  })
}

/** First worksheet as rows. */
export function readXlsx(buffer) {
  return readXlsxSheets(buffer)[0].rows
}
