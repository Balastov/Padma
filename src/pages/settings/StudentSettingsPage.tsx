import Logo from '../../components/Logo'
import ProfileMenu from '../../components/ProfileMenu'
import UsersPage from '../UsersPage'
import type { User } from '../../api'
import '../DashboardPage.css'

export default function StudentSettingsPage({
  user,
  onLogout: _onLogout,
  onUserChange,
}: {
  user: User
  onLogout: () => Promise<void>
  onUserChange: (user: User) => void
}) {
  return (
    <div className="settings-in-shell">
      <UsersPage
        user={user}
        users={[user]}
        refresh={async () => {}}
        profile
        onUserChange={onUserChange}
      />
    </div>
  )
}

/** Standalone wrapper if opened without layout (legacy). */
export function StudentSettingsStandalone({
  user,
  onLogout,
  onUserChange,
}: {
  user: User
  onLogout: () => Promise<void>
  onUserChange: (user: User) => void
}) {
  return (
    <div className="student-page">
      <header className="student-header">
        <Logo />
        <ProfileMenu user={user} onLogout={onLogout} />
      </header>
      <StudentSettingsPage
        user={user}
        onLogout={onLogout}
        onUserChange={onUserChange}
      />
    </div>
  )
}
