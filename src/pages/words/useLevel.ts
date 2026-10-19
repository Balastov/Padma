import { useState } from 'react'
import { savedLevel, saveLevel } from '../../student/lexicon'

/** Level filter of the student dictionary, remembered on this device. */
export function useLevel() {
  const [level, setLevel] = useState(savedLevel)
  return [
    level,
    (bookId: string) => {
      saveLevel(bookId)
      setLevel(bookId)
    },
  ] as const
}
