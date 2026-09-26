export type WordStatus = 'new' | 'learning' | 'reviewing' | 'mastered'

export type VocabWord = {
  id: string
  word: string
  transcription: string
  translation: string
  pos: string
  level: string
  exampleEn: string
  exampleRu: string
  relatedIds: string[]
  image?: string
  topicId: string
  subtopicId: string
  lessonIds: string[]
}

export type Subtopic = {
  id: string
  topicId: string
  title: string
  wordIds: string[]
  image?: string
}

export type Topic = {
  id: string
  title: string
  description: string
  kind: 'main' | 'lexical'
  image?: string
  subtopicIds: string[]
}

export type VocabLesson = {
  id: string
  title: string
  date: string
  description: string
  wordIds: string[]
  image?: string
}

export type Collection = {
  id: string
  title: string
  description: string
  wordIds: string[]
  tags: string[]
  updated: string
  image?: string
}

export type LibraryMaterial = {
  id: string
  title: string
  kind: string
  description: string
}

export type PathNode = {
  id: string
  title: string
  status: 'done' | 'current' | 'next'
}

export type ExerciseType =
  | 'cards'
  | 'training-cards'
  | 'assemble'
  | 'choose-translation'
  | 'assemble-audio'
  | 'choose-translation-audio'
  | 'find-word'
  | 'match-pairs'
  | 'true-false'
  | 'memory'

export const EXERCISE_META: Record<
  ExerciseType,
  { group: string; title: string; description: string }
> = {
  cards: {
    group: 'Повторение',
    title: 'Карточки со словами',
    description: 'Слово, транскрипция, перевод, пример и аудио.',
  },
  'training-cards': {
    group: 'Повторение',
    title: 'Тренировочные карточки',
    description: 'Вспомните значение, затем отметьте уверенность.',
  },
  assemble: {
    group: 'Понимание',
    title: 'Собери слово',
    description: 'Составьте английское слово из букв.',
  },
  'choose-translation': {
    group: 'Понимание',
    title: 'Выбери перевод',
    description: 'Выберите правильный перевод из вариантов.',
  },
  'assemble-audio': {
    group: 'Аудирование',
    title: 'Собери слово · Аудио',
    description: 'Услышьте слово и соберите его из букв.',
  },
  'choose-translation-audio': {
    group: 'Аудирование',
    title: 'Выбери перевод · Аудио',
    description: 'Услышьте слово и выберите значение.',
  },
  'find-word': {
    group: 'Игровые форматы',
    title: 'Найди слово',
    description: 'Найдите английское слово в сетке букв.',
  },
  'match-pairs': {
    group: 'Игровые форматы',
    title: 'Собери пару',
    description: 'Соедините слово с переводом.',
  },
  'true-false': {
    group: 'Игровые форматы',
    title: 'Верно — неверно',
    description: 'Определите, верный ли перевод.',
  },
  memory: {
    group: 'Игровые форматы',
    title: 'Мемория',
    description: 'Найдите пары: слово и перевод.',
  },
}

export const ALLOWED_EXERCISES: ExerciseType[] = [
  'cards',
  'training-cards',
  'assemble',
  'choose-translation',
  'assemble-audio',
  'choose-translation-audio',
  'find-word',
  'match-pairs',
  'true-false',
  'memory',
]
