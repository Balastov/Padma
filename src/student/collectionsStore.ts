import type { Collection } from './types'
import { seed } from './mock/seed'

const KEY = 'padma-collections'

export function loadCollections(): Collection[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Collection[]
  } catch {
    /* ignore */
  }
  return structuredClone(seed.defaultCollections)
}

export function saveCollections(list: Collection[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}
