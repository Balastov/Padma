import { Volume2 } from 'lucide-react'
import { playWordAudio, playExampleAudio } from '../../student/audio'

export function WordAudioButton({
  word,
  vocabId,
  label = 'Произношение',
}: {
  word: string
  vocabId?: string
  label?: string
}) {
  return (
    <button
      type="button"
      className="word-audio"
      aria-label={label}
      onClick={() => void playWordAudio(word, vocabId)}
    >
      <Volume2 size={16} />
    </button>
  )
}

export function ExampleAudioButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="word-audio"
      aria-label="Озвучить пример"
      onClick={() => playExampleAudio(text)}
    >
      <Volume2 size={16} />
    </button>
  )
}
