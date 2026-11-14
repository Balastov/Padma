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
import { badgeText, useChatUnread } from '../chatUnread'
import JoinLessonButton from '../components/JoinLessonButton'
import './StudentLayout.css'
import '../styles/workspace.css'

export default function StudentLayout({
  user,
  onLogout,
}: {
  user: User
  onLogout: () => Promise<void>
}) {
  const chat = useChatUnread()
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
          <JoinLessonButton />
          <button
            type="button"
            className="student-shell__chat"
            aria-label={
              chat.total
                ? `Чат с преподавателем, непрочитанных: ${chat.total}`
                : 'Чат с преподавателем'
            }
            onClick={() => chat.openChat()}
          >
            <MessageCircle size={22} />
            {chat.total > 0 && (
              <span className="unread-badge unread-badge--corner">
                {badgeText(chat.total)}
              </span>
            )}
          </button>
          <ProfileMenu user={user} onLogout={onLogout} compact />
        </header>
        <div className="student-shell__content">
          <Outlet />
        </div>
      </div>
      <ChatDrawer
        key={chat.target?.at}
        user={user}
        open={Boolean(chat.target)}
        initialPeer={chat.target?.peerId}
        onClose={chat.closeChat}
      />
    </div>
  )
}
