import { CalendarDays, Clock3, Video } from 'lucide-react'
import teacherImg from '../assets/teacher.jpg'
import santoriniImg from '../assets/santorini.jpg'
import './NextLesson.css'

export default function NextLesson() {
  return (
    <section className="next glass">
      <div className="next__media">
        <img src={teacherImg} alt="Милда" className="next__teacher" />
        <span className="next__with">
          <span className="next__with-icon" aria-hidden />
          С Милдой
        </span>
      </div>

      <div className="next__body">
        <div
          className="next__scene"
          style={{ backgroundImage: `url(${santoriniImg})` }}
          aria-hidden
        />
        <div className="next__veil" />
        <div className="next__content">
          <p className="next__label">Следующий урок</p>
          <h2 className="next__title">Talking about experiences</h2>
          <div className="next__meta">
            <span>
              <CalendarDays size={15} strokeWidth={1.8} />
              Сегодня, 18:00
            </span>
            <span>
              <Clock3 size={15} strokeWidth={1.8} />
              60 минут
            </span>
          </div>
          <a
            className="btn-cta next__cta"
            href="https://app.tolk.ru"
            target="_blank"
            rel="noreferrer"
          >
            <Video size={17} strokeWidth={1.9} />
            Подключиться к уроку
            <span aria-hidden>→</span>
          </a>
        </div>
        <div className="next__motto" aria-hidden>
          <span>SMALL STEPS BIG HORIZONS</span>
          <em>Better You · Brighter Tomorrow</em>
        </div>
      </div>
    </section>
  )
}
