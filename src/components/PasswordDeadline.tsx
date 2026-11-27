import { Link } from 'react-router-dom'
import { Link2 } from 'lucide-react'
import type { User } from '../api'
import { formatDeadline, useProviders } from '../quazar'
import './QuazarLink.css'

/** Reminder for accounts that still sign in with a password (stage 3.3). */
export default function PasswordDeadline({
  user,
  settingsPath,
}: {
  user: User
  settingsPath: string
}) {
  const { quazar, passwordDeadline } = useProviders()
  if (!quazar || !passwordDeadline || user.quazarLinked || !user.hasPassword)
    return null
  return (
    <p className="notice password-deadline" role="status">
      <span>
        До {formatDeadline(passwordDeadline)} привяжите Квазар: после этого вход
        по паролю отключится.
      </span>
      <Link className="button-secondary button-small" to={settingsPath}>
        <Link2 size={16} />
        Привязать
      </Link>
    </p>
  )
}
