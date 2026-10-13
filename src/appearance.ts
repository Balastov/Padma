import { createContext, useContext } from 'react'

export type Background = {
  url: string
  blur: number
  tint: number
  updated?: string
}
export type Appearance = {
  active: Background | null
  source?: 'mine' | 'teacher' | 'default' | null
  mine?: Background | null
  default?: Background | null
  canEditMine?: boolean
  canEditDefault?: boolean
}

export const BLUR_DEFAULT = 24
export const TINT_DEFAULT = 35

export const AppearanceContext = createContext<{
  appearance: Appearance | null
  reload: () => Promise<void>
  /** Temporary background shown site-wide while editing; null = none. */
  setPreview: (preview: Background | null | undefined) => void
}>({
  appearance: null,
  reload: async () => {},
  setPreview: () => {},
})

export const useAppearance = () => useContext(AppearanceContext)

const MAX_SIDE = 2560
const MAX_BYTES = 5 * 1024 * 1024

/** Downscales a photo to at most 2560px and re-encodes it as JPEG. */
export async function prepareBackground(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type))
    throw new Error('Выберите изображение JPG, PNG или WebP')
  if (file.size > 30 * 1024 * 1024)
    throw new Error('Файл слишком большой (больше 30 МБ)')
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Не удалось открыть изображение')
  })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Браузер не смог обработать изображение')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  for (const quality of [0.86, 0.76, 0.62]) {
    const url = canvas.toDataURL('image/jpeg', quality)
    if (url.length * 0.75 < MAX_BYTES) return url
  }
  throw new Error('Не удалось уменьшить изображение до 5 МБ')
}
