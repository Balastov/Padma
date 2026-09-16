import { useState } from 'react'
import teacherImg from '../assets/teacher.jpg'
import './Schedule.css'

const DAYS = [
  { key: 'mon', label: 'Пн', date: 12 },
  { key: 'tue', label: 'Вт', date: 13 },
  { key: 'wed', label: 'Ср', date: 14 },
  { key: 'thu', label: 'Чт', date: 15 },
  { key: 'fri', label: 'Пт', date: 16 },
  { key: 'sat', label: 'Сб', date: 17 },
  { key: 'sun', label: 'Вс', date: 18 },
]

const LESSONS = [
  {
    id: 1,
    when: 'Сегодня, 18:00',
    title: 'Talking about experiences',
    with: 'С Милдой',
    duration: '60 минут',
    tone: 'purple' as const,
  },
  {
    id: 2,
    when: 'Пт, 16 мая · 18:00',
    title: 'Future plans',
    with: 'С Милдой',
    duration: '60 минут',
    tone: 'blue' as const,
  },
  {
    id: 3,
    when: 'Сб, 17 мая · 11:00',
    title: 'Listening practice',
    with: 'С Милдой',
    duration: '45 минут',
    tone: 'cyan' as const,
  },
]

export default function Schedule() {
  const [activeDay, setActiveDay] = useState('thu')

  return (
    <section className="schedule glass">
      <div className="schedule__head">
        <h2>Расписание на неделю</h2>
        <button type="button" className="schedule__all">
          Все занятия →
        </button>
      </div>

      <div className="schedule__days" role="tablist" aria-label="Дни недели">
        {DAYS.map((day) => (
          <button
            key={day.key}
            type="button"
            role="tab"
            aria-selected={activeDay === day.key}
            className={`schedule__day${activeDay === day.key ? ' is-active' : ''}`}
            onClick={() => setActiveDay(day.key)}
          >
            <span>{day.label}</span>
            <strong>{day.date}</strong>
          </button>
        ))}
      </div>

      <ul className="schedule__list">
        {LESSONS.map((lesson) => (
          <li key={lesson.id} className="schedule__item">
            <span className={`schedule__dot schedule__dot--${lesson.tone}`} />
            <div className="schedule__info">
              <p className="schedule__when">{lesson.when}</p>
              <p className="schedule__title">{lesson.title}</p>
              <p className="schedule__sub">
                {lesson.with}, {lesson.duration}
              </p>
            </div>
            <img src={teacherImg} alt="" className="schedule__avatar" />
          </li>
        ))}
      </ul>
    </section>
  )
}
