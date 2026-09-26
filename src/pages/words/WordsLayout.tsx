import { NavLink, Outlet } from 'react-router-dom'
import { BookMarked, Dumbbell, ChartColumn } from 'lucide-react'
import './WordsLayout.css'

export default function WordsLayout() {
  return (
    <div className="words-layout">
      <nav className="words-tabs" aria-label="Мои слова">
        <NavLink to="/words/dictionary">
          <BookMarked size={18} />
          Словарь
        </NavLink>
        <NavLink to="/words/trainer">
          <Dumbbell size={18} />
          Тренажёр
        </NavLink>
        <NavLink to="/words/progress">
          <ChartColumn size={18} />
          Прогресс
        </NavLink>
      </nav>
      <Outlet />
    </div>
  )
}
