import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Home,
  Compass,
  BookOpen,
  Library,
  MessageCircle,
  Languages,
} from 'lucide-react'
import type { User } from '../api'
import Logo from '../components/Logo'
import ProfileMenu from '../components/ProfileMenu'
import ChatDrawer from '../components/ChatDrawer'
import './StudentLayout.css'
import '../styles/workspace.css'

export default function StudentLayout({
  user,
  onLogout,
}: {
  user: User
  onLogout: () => Promise<void>
}) {
  const [chatOpen, setChatOpen] = useState(false)
  return (
    <div className="student-shell">
      <aside className="student-shell__sidebar glass-panel">
        <Logo />
        <nav aria-label="Меню ученика">
          <NavLink to="/today" end>
            <Home size={22} />
            <span>Сегодня</span>
          </NavLink>
          <NavLink to="/path">
            <Compass size={22} />
            <span>Мой путь</span>
          </NavLink>
          <NavLink to="/lessons">
            <BookOpen size={22} />
            <span>Мои уроки</span>
          </NavLink>
          <NavLink to="/words">
            <Languages size={22} />
            <span>Мои слова</span>
          </NavLink>
          <NavLink to="/library">
            <Library size={22} />
            <span>Библиотека</span>
          </NavLink>
        </nav>
        <p className="student-shell__quote">
          Маленькие слова открывают большие миры
        </p>
      </aside>
      <div className="student-shell__main">
        <header className="student-shell__top">
          <button
            type="button"
            className="student-shell__chat"
            aria-label="Чат с преподавателем"
            onClick={() => setChatOpen(true)}
          >
            <MessageCircle size={22} />
          </button>
          <ProfileMenu user={user} onLogout={onLogout} compact />
        </header>
        <div className="student-shell__content">
          <Outlet />
        </div>
      </div>
      <ChatDrawer
        user={user}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </div>
  )
}
