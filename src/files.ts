import { ApiError } from './api'

/** An uploaded file; `deleted` once its 30 days have passed. */
export type StoredFile = {
  id: string
  name: string
  size: number
  deleted: boolean
}

// Must match server/files.mjs: images, office documents and plain text.
const EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'heic',
  'heif',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
  'rtf',
  'csv',
  'txt',
]
export const ACCEPT = EXTENSIONS.map((e) => '.' + e).join(',')
export const MAX_FILE_SIZE = 20 * 1024 * 1024
export const MAX_FILES = 5
export const KEEP_DAYS = 30
export const FILE_HINT =
  'Изображения, PDF, документы, таблицы, презентации и TXT · до 20 МБ каждый'

export function fileProblem(file: File) {
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1].toLowerCase() || ''
  if (!EXTENSIONS.includes(ext))
    return `«${file.name}»: можно прикреплять изображения, документы, таблицы, презентации и TXT`
  if (!file.size) return `«${file.name}»: файл пустой`
  if (file.size > MAX_FILE_SIZE) return `«${file.name}»: файл больше 20 МБ`
  return ''
}

export const formatSize = (size: number) =>
  size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} КБ`
    : `${(size / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`

export const fileUrl = (file: StoredFile) => '/api/files/' + file.id

export async function uploadFile(file: File): Promise<StoredFile> {
  const res = await fetch('/api/files?name=' + encodeURIComponent(file.name), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok)
    throw new ApiError(
      result.error ||
        (res.status === 413
          ? 'Файл больше 20 МБ'
          : 'Не удалось загрузить файл'),
      res.status,
    )
  return result as StoredFile
}

/** Uploads files one by one and returns their ids for the form request. */
export async function uploadAll(files: File[]) {
  const ids: string[] = []
  for (const file of files) ids.push((await uploadFile(file)).id)
  return ids
}
