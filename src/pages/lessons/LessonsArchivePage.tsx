import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, dateKey, friendlyDate, moscowToday } from '../../api'
import type { Lesson } from '../../api'
import { useCatalog } from '../../student/useCatalog'
import './LessonsArchive.css'

export default function LessonsArchivePage() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [error, setError] = useState('')
  const { catalog } = useCatalog()
  const today = dateKey(moscowToday())
  useEffect(() => {
    api<Lesson[]>('/lessons')
      .then(setLessons)
      .catch((e) => setError(e.message))
  }, [])
  const past = lessons
    .filter((l) => l.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))
  const vocabLessons = catalog?.lessons || []
  return (
    <div className="lessons-archive">
      <header className="page-heading">
        <div>
          <h1>Мои уроки</h1>
          <p>Архив уже прошедших занятий.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="lessons-archive__list">
        {past.map((l) => (
          <Link
            key={l.id}
            to={`/lessons/${l.id}`}
            className="glass-panel lessons-archive__card"
          >
            <strong>{l.title}</strong>
            <span>{friendlyDate(l.date)}</span>
            <small>{l.note || 'Занятие завершено'}</small>
          </Link>
        ))}
        {!past.length && !error && (
          <p className="empty-state glass-panel">
            Прошедших уроков пока нет. Текущие и будущие — на странице «Сегодня».
          </p>
        )}
        {vocabLessons.map((vl) => (
          <Link
            key={'v-' + vl.id}
            to={`/words/dictionary/lessons/${vl.id}`}
            className="glass-panel lessons-archive__card"
          >
            <strong>{vl.title}</strong>
            <span>{vl.date}</span>
            <small>Лексика урока · {vl.wordIds.length} слов</small>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function LessonDetailPage() {
  const { lessonId } = useParams()
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const { catalog } = useCatalog()
  useEffect(() => {
    api<Lesson[]>('/lessons')
      .then((list) => setLesson(list.find((l) => l.id === lessonId) || null))
      .catch(() => setLesson(null))
  }, [lessonId])
  const vocab = catalog?.lessons.find((v) => v.id === lessonId)
  if (!lesson && !vocab) return <p className="empty-state">Урок не найден.</p>
  return (
    <div className="lesson-detail">
      <header className="page-heading">
        <div>
          <h1>{lesson?.title || vocab?.title}</h1>
          <p>
            {lesson
              ? friendlyDate(lesson.date)
              : vocab?.date || 'Лексика занятия'}
          </p>
        </div>
      </header>
      {vocab && vocab.wordIds.length > 0 && (
        <p>
          <Link to={`/words/dictionary/lessons/${vocab.id}`}>
            Слова урока · {vocab.wordIds.length}
          </Link>
        </p>
      )}
      {lesson?.note && <p className="notice">{lesson.note}</p>}
    </div>
  )
}
