import { deflateRawSync } from 'node:zlib'

// Test helper: builds a small XLSX. sheets: [{ name, rows }] or one table.
// prefix: namespace prefix for spreadsheet tags ('x:'), as some tools write.
export function buildXlsx(input, { prefix = '' } = {}) {
  const sheets = Array.isArray(input[0]) ? [{ name: 'Sheet1', rows: input }] : input
  const p = prefix
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  const strings = []
  const sheetXml = (table) =>
    `<${p}worksheet><${p}sheetData>${table
      .map((row, r) => {
        const cells = row
          .map((value, c) => {
            const ref = String.fromCharCode(65 + c) + (r + 1)
            if (typeof value === 'number')
              return `<${p}c r="${ref}"><${p}v>${value}</${p}v></${p}c>`
            if (value === '') return `<${p}c r="${ref}" s="1"/>`
            if (p)
              return `<${p}c r="${ref}" t="str"><${p}v>${esc(value)}</${p}v></${p}c>`
            strings.push(value)
            return `<c r="${ref}" t="s"><v>${strings.length - 1}</v></c>`
          })
          .join('')
        return `<${p}row r="${r + 1}">${cells}</${p}row>`
      })
      .join('')}</${p}sheetData></${p}worksheet>`
  const files = {}
  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheet.rows)
  })
  files['xl/workbook.xml'] = `<${p}workbook xmlns:r="r"><${p}sheets>${sheets
    .map(
      (sheet, i) =>
        `<${p}sheet name="${esc(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join('')}</${p}sheets></${p}workbook>`
  files['xl/_rels/workbook.xml.rels'] = `<Relationships>${sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="worksheet" Target="${p ? '/xl/' : ''}worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('')}</Relationships>`
  files['xl/sharedStrings.xml'] = `<${p}sst>${strings
    .map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`)
    .join('')}</${p}sst>`
  const locals = []
  const central = []
  let offset = 0
  Object.entries(files).forEach(([name, content], index) => {
    const raw = Buffer.from(content)
    const method = index % 2 ? 0 : 8
    const data = method ? deflateRawSync(raw) : raw
    const nameBuf = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(method, 10)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(raw.length, 24)
    entry.writeUInt16LE(nameBuf.length, 28)
    entry.writeUInt32LE(offset, 42)
    locals.push(local, nameBuf, data)
    central.push(entry, nameBuf)
    offset += local.length + nameBuf.length + data.length
  })
  const dir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, dir, end])
}
