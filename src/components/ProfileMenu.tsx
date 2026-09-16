import { useState, useRef, useEffect } from 'react'
import { ChevronDown, LogOut } from 'lucide-react'
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
