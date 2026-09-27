import { Video } from 'lucide-react'
import { LESSON_URL } from '../api'
import './JoinLessonButton.css'

export default function JoinLessonButton() {
  return (
    <a
      className="join-lesson"
      href={LESSON_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Присоединиться к уроку"
    >
      <span className="join-lesson__icon">
        <Video size={18} />
        <span className="join-lesson__pulse" aria-hidden="true" />
      </span>
      <span className="join-lesson__text">
        <span className="join-lesson__full">Присоединиться к уроку</span>
        <span className="join-lesson__short">К уроку</span>
      </span>
    </a>
  )
}
