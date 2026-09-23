import Logo from '../components/Logo'
import ProfileMenu from '../components/ProfileMenu'
import UsersPage from './UsersPage'
import type { User } from '../api'
import './DashboardPage.css'

export default function StudentSettingsPage({
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
