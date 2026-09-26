/** Prefer server vocab audio when available; otherwise Web Speech. */
export async function playWordAudio(word: string, vocabId?: string) {
  if (vocabId) {
    try {
      const res = await fetch(`/api/vocab/${vocabId}/audio`, {
        credentials: 'same-origin',
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        await audio.play()
        audio.onended = () => URL.revokeObjectURL(url)
        return
      }
    } catch {
      /* fall through */
    }
  }
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(word)
  u.lang = 'en-GB'
  window.speechSynthesis.speak(u)
}

export function playExampleAudio(text: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-GB'
  window.speechSynthesis.speak(u)
}
