import type {
  Collection,
  LibraryMaterial,
  PathNode,
  Topic,
  VocabLesson,
  VocabWord,
  Subtopic,
} from '../types'

const words: VocabWord[] = [
  {
    id: 'w-journey',
    word: 'journey',
    transcription: '/ˈdʒɜːni/',
    translation: 'путешествие, путь',
    pos: 'Существительное',
    level: 'A2',
    exampleEn: 'The journey was long but incredible.',
    exampleRu: 'Путешествие было долгим, но невероятным.',
    relatedIds: ['w-route', 'w-departure', 'w-arrival'],
    topicId: 'travel',
    subtopicId: 'airport',
    lessonIds: ['vl-12'],
  },
  {
    id: 'w-luggage',
    word: 'luggage',
    transcription: '/ˈlʌɡɪdʒ/',
    translation: 'багаж',
    pos: 'Существительное',
    level: 'A2',
    exampleEn: 'Please put your luggage on the scale.',
    exampleRu: 'Пожалуйста, поставьте багаж на весы.',
    relatedIds: ['w-boarding', 'w-journey'],
    topicId: 'travel',
    subtopicId: 'airport',
    lessonIds: ['vl-12'],
  },
  {
    id: 'w-departure',
    word: 'departure',
    transcription: '/dɪˈpɑːtʃər/',
    translation: 'отправление, вылет',
    pos: 'Существительное',
    level: 'B1',
    exampleEn: 'Our flight departure is at 6 p.m.',
    exampleRu: 'Наш вылет в 18:00.',
    relatedIds: ['w-arrival', 'w-journey'],
    topicId: 'travel',
    subtopicId: 'airport',
    lessonIds: ['vl-12'],
  },
  {
    id: 'w-arrival',
    word: 'arrival',
    transcription: '/əˈraɪvl/',
    translation: 'прибытие',
    pos: 'Существительное',
    level: 'A2',
    exampleEn: 'Arrival time may change due to weather.',
    exampleRu: 'Время прибытия может измениться из‑за погоды.',
    relatedIds: ['w-departure'],
    topicId: 'travel',
    subtopicId: 'airport',
    lessonIds: ['vl-12'],
  },
  {
    id: 'w-boarding',
    word: 'boarding pass',
    transcription: '/ˈbɔːdɪŋ pɑːs/',
    translation: 'посадочный талон',
    pos: 'Существительное',
    level: 'A2',
    exampleEn: 'Show your boarding pass at the gate.',
    exampleRu: 'Покажите посадочный талон у выхода на посадку.',
    relatedIds: ['w-luggage', 'w-terminal'],
    topicId: 'travel',
    subtopicId: 'airport',
    lessonIds: ['vl-12'],
  },
  {
    id: 'w-terminal',
    word: 'terminal',
    transcription: '/ˈtɜːmɪnl/',
    translation: 'терминал',
    pos: 'Существительное',
    level: 'A2',
    exampleEn: 'We met at the airport terminal.',
    exampleRu: 'Мы встретились в терминале аэропорта.',
    relatedIds: ['w-boarding'],
    topicId: 'travel',
    subtopicId: 'airport',
    lessonIds: ['vl-12'],
  },
  {
    id: 'w-route',
    word: 'route',
    transcription: '/ruːt/',
    translation: 'маршрут',
    pos: 'Существительное',
    level: 'A2',
    exampleEn: 'What is the fastest route to the city?',
    exampleRu: 'Какой самый быстрый маршрут до города?',
    relatedIds: ['w-journey'],
    topicId: 'travel',
    subtopicId: 'city',
    lessonIds: ['vl-12'],
  },
  {
    id: 'w-ticket',
    word: 'ticket',
    transcription: '/ˈtɪkɪt/',
    translation: 'билет',
    pos: 'Существительное',
    level: 'A1',
    exampleEn: 'I bought a ticket online.',
    exampleRu: 'Я купил билет онлайн.',
    relatedIds: ['w-book'],
    topicId: 'travel',
    subtopicId: 'booking',
    lessonIds: ['vl-12'],
  },
  {
    id: 'w-book',
    word: 'to book',
    transcription: '/bʊk/',
    translation: 'бронировать',
    pos: 'Глагол',
    level: 'A2',
    exampleEn: 'We need to book a hotel room.',
    exampleRu: 'Нам нужно забронировать номер в отеле.',
    relatedIds: ['w-ticket'],
    topicId: 'travel',
    subtopicId: 'booking',
    lessonIds: ['vl-12'],
  },
  {
    id: 'w-though',
    word: 'though',
    transcription: '/ðəʊ/',
    translation: 'хотя, однако',
    pos: 'Союз',
    level: 'B1',
    exampleEn: 'It was hard, though we kept going.',
    exampleRu: 'Было трудно, хотя мы продолжали.',
    relatedIds: [],
    topicId: 'people',
    subtopicId: 'feelings',
    lessonIds: ['vl-11'],
  },
  {
    id: 'w-environment',
    word: 'environment',
    transcription: '/ɪnˈvaɪrənmənt/',
    translation: 'окружение, среда',
    pos: 'Существительное',
    level: 'B1',
    exampleEn: 'We should protect the environment.',
    exampleRu: 'Мы должны защищать окружающую среду.',
    relatedIds: [],
    topicId: 'nature',
    subtopicId: 'planet',
    lessonIds: ['vl-10'],
  },
  {
    id: 'w-perspective',
    word: 'perspective',
    transcription: '/pəˈspektɪv/',
    translation: 'точка зрения, перспектива',
    pos: 'Существительное',
    level: 'B2',
    exampleEn: 'Try to see it from another perspective.',
    exampleRu: 'Попробуй взглянуть на это с другой стороны.',
    relatedIds: [],
    topicId: 'people',
    subtopicId: 'feelings',
    lessonIds: ['vl-11'],
  },
]

const topics: Topic[] = [
  {
    id: 'travel',
    title: 'Путешествия и транспорт',
    description: 'Лексика для поездок, аэропорта и перемещений.',
    kind: 'main',
    subtopicIds: ['airport', 'booking', 'hotel', 'city'],
  },
  {
    id: 'people',
    title: 'Люди и отношения',
    description: 'Общение, эмоции и повседневные разговоры.',
    kind: 'main',
    subtopicIds: ['feelings'],
  },
  {
    id: 'home',
    title: 'Дом и повседневность',
    description: 'Быт, дом и привычные дела.',
    kind: 'main',
    subtopicIds: [],
  },
  {
    id: 'food',
    title: 'Еда и напитки',
    description: 'Ресторан, продукты и вкусы.',
    kind: 'main',
    subtopicIds: [],
  },
  {
    id: 'work',
    title: 'Работа и образование',
    description: 'Учёба, офис и карьера.',
    kind: 'main',
    subtopicIds: [],
  },
  {
    id: 'health',
    title: 'Здоровье и тело',
    description: 'Самочувствие и описание состояния.',
    kind: 'main',
    subtopicIds: [],
  },
  {
    id: 'nature',
    title: 'Природа и география',
    description: 'Окружающий мир и места.',
    kind: 'main',
    subtopicIds: ['planet'],
  },
  {
    id: 'tech',
    title: 'Технологии и связь',
    description: 'Гаджеты, интернет и коммуникации.',
    kind: 'main',
    subtopicIds: [],
  },
  {
    id: 'leisure',
    title: 'Досуг и спорт',
    description: 'Хобби, спорт и свободное время.',
    kind: 'main',
    subtopicIds: [],
  },
  {
    id: 'irregular',
    title: 'Неправильные глаголы',
    description: 'Базовые неправильные глаголы.',
    kind: 'lexical',
    subtopicIds: [],
  },
  {
    id: 'phrasal',
    title: 'Фразовые глаголы',
    description: 'Частые фразовые глаголы.',
    kind: 'lexical',
    subtopicIds: [],
  },
]

const subtopics: Subtopic[] = [
  {
    id: 'airport',
    topicId: 'travel',
    title: 'Аэропорт',
    wordIds: [
      'w-journey',
      'w-luggage',
      'w-departure',
      'w-arrival',
      'w-boarding',
      'w-terminal',
    ],
  },
  {
    id: 'booking',
    topicId: 'travel',
    title: 'Бронирование',
    wordIds: ['w-ticket', 'w-book'],
  },
  {
    id: 'hotel',
    topicId: 'travel',
    title: 'Отель',
    wordIds: [],
  },
  {
    id: 'city',
    topicId: 'travel',
    title: 'Поездки по городу',
    wordIds: ['w-route'],
  },
  {
    id: 'feelings',
    topicId: 'people',
    title: 'Чувства и мнения',
    wordIds: ['w-though', 'w-perspective'],
  },
  {
    id: 'planet',
    topicId: 'nature',
    title: 'Планета',
    wordIds: ['w-environment'],
  },
]

const vocabLessons: VocabLesson[] = [
  {
    id: 'vl-12',
    title: 'Урок 12 · Travelling',
    date: '2024-01-12',
    description:
      'Лексика для путешествий: транспорт, бронирование, в аэропорту, полезные фразы.',
    wordIds: [
      'w-journey',
      'w-ticket',
      'w-book',
      'w-departure',
      'w-arrival',
      'w-luggage',
      'w-boarding',
      'w-terminal',
      'w-route',
    ],
  },
  {
    id: 'vl-11',
    title: 'Урок 11 · Opinions',
    date: '2024-01-05',
    description: 'Как выражать мнение и соглашаться.',
    wordIds: ['w-though', 'w-perspective'],
  },
  {
    id: 'vl-10',
    title: 'Урок 10 · Nature',
    date: '2023-12-20',
    description: 'Слова о природе и окружающей среде.',
    wordIds: ['w-environment'],
  },
]

const defaultCollections: Collection[] = [
  {
    id: 'c-trip',
    title: 'Моё путешествие',
    description: 'Слова, которые пригодятся в поездке.',
    wordIds: ['w-journey', 'w-luggage', 'w-departure', 'w-route'],
    tags: ['Путешествия', 'Аэропорт'],
    updated: '2024-02-12',
  },
  {
    id: 'c-exam',
    title: 'Для экзамена',
    description: 'Слова для подготовки к проверке.',
    wordIds: ['w-though', 'w-perspective', 'w-environment'],
    tags: ['Экзамен'],
    updated: '2024-02-08',
  },
]

const pathNodes: PathNode[] = [
  { id: 'p1', title: 'Everyday English', status: 'done' },
  { id: 'p2', title: 'Talking about the past', status: 'done' },
  { id: 'p3', title: 'Travel conversations', status: 'current' },
  { id: 'p4', title: 'Expressing opinions', status: 'next' },
  { id: 'p5', title: 'Confident communication', status: 'next' },
]

const library: LibraryMaterial[] = [
  {
    id: 'm1',
    title: 'Present Perfect vs Past Simple',
    kind: 'Объяснение',
    description: 'Краткое сравнение времён с примерами.',
  },
  {
    id: 'm2',
    title: 'Travel phrases PDF',
    kind: 'PDF',
    description: 'Полезные фразы для аэропорта и отеля.',
  },
  {
    id: 'm3',
    title: 'Listening: At the airport',
    kind: 'Аудио',
    description: 'Диалог у стойки регистрации.',
  },
]

export const seed = {
  words,
  topics,
  subtopics,
  vocabLessons,
  defaultCollections,
  pathNodes,
  library,
  revisitWordIds: ['w-departure', 'w-environment', 'w-perspective'],
  level: { current: 'A2', goal: 'B1', aim: 'Свободно общаться в путешествиях' },
}

export function getWord(id: string) {
  return words.find((w) => w.id === id)
}

export function getWordsByIds(ids: string[]) {
  return ids.map(getWord).filter(Boolean) as VocabWord[]
}

export function searchWords(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return words
  return words.filter(
    (w) =>
      w.word.toLowerCase().includes(q) ||
      w.translation.toLowerCase().includes(q) ||
      w.transcription.toLowerCase().includes(q) ||
      topics.some(
        (t) =>
          t.id === w.topicId && t.title.toLowerCase().includes(q),
      ),
  )
}
