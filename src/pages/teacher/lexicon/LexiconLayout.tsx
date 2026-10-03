import { NavLink, Outlet } from 'react-router-dom'
import { BookOpen, Dumbbell, ChartColumn } from 'lucide-react'
import './lexicon.css'

export default function LexiconLayout() {
  return (
    <div className="lexicon">
      <nav className="lexicon-tabs" aria-label="Разделы лексики">
        <NavLink to="/teacher/lexicon/dictionary">
          <BookOpen size={18} /> Словарь
        </NavLink>
        <NavLink to="/teacher/lexicon/trainer">
          <Dumbbell size={18} /> Тренажёр
        </NavLink>
        <NavLink to="/teacher/lexicon/progress">
          <ChartColumn size={18} /> Прогресс
        </NavLink>
      </nav>
      <Outlet />
    </div>
  )
}
