import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, dateKey, friendlyDate, moscowToday } from '../../api'
import type { Lesson } from '../../api'
import { seed } from '../../student/mock/seed'
import './LessonsArchive.css'

export default function LessonsArchivePage() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [error, setError] = useState('')
  const today = dateKey(moscowToday())
  useEffect(() => {
    api<Lesson[]>('/lessons')
      .then(setLessons)
      .catch((e) => setError(e.message))
  }, [])
  const past = lessons
    .filter((l) => l.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))
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
        {seed.vocabLessons.map((vl) => (
          <Link
            key={vl.id}
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
  useEffect(() => {
    api<Lesson[]>('/lessons')
      .then((list) => setLesson(list.find((l) => l.id === lessonId) || null))
      .catch(() => setLesson(null))
  }, [lessonId])
  const vocab = seed.vocabLessons.find((v) => v.id === lessonId)
  if (!lesson && !vocab)
    return <p className="empty-state">Урок не найден.</p>
  return (
    <div className="lesson-detail">
      <header className="page-heading">
        <div>
          <h1>{lesson?.title || vocab?.title}</h1>
          <p>
            {lesson
              ? friendlyDate(lesson.date)
              : vocab?.date}{' '}
            · архив занятия
          </p>
        </div>
      </header>
      <section className="glass-panel lesson-detail__grid">
        <div>
          <h2>Тема</h2>
          <p>{lesson?.title || vocab?.title}</p>
        </div>
        <div>
          <h2>Домашняя работа</h2>
          <p>Смотрите актуальные задания на «Сегодня».</p>
        </div>
        <div>
          <h2>Слова урока</h2>
          <Link to={`/words/dictionary/lessons/${vocab?.id || 'vl-12'}`}>
            Открыть лексику
          </Link>
        </div>
        <div>
          <h2>Материалы</h2>
          <Link to="/library">Библиотека</Link>
        </div>
      </section>
    </div>
  )
}
