import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { isStaff } from '../api'
import type { User } from '../api'
import Avatar from './Avatar'

export default function ProfileMenu({
  user,
  onLogout,
}: {
  user: User
  onLogout: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const profilePath = isStaff(user) ? '/teacher/settings' : '/dashboard/settings'
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
    }
  }, [])
  return (
    <div className="profile-menu" ref={ref}>
      <button
        type="button"
        className="profile-trigger"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Avatar user={user} />
        <span>{user.name}</span>
        <ChevronDown size={18} />
      </button>
      {open && (
        <div className="profile-popover glass-panel">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              navigate(profilePath)
            }}
          >
            <UserRound size={18} />
            Мой профиль
          </button>
          <button
            type="button"
            onClick={() =>
              onLogout().catch(() => setError('Не удалось выйти. Повторите.'))
            }
          >
            <LogOut size={18} />
            Выйти
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  )
}
