import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { api, ApiError, isStaff } from './api'
import type { User } from './api'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import TeacherPage from './pages/TeacherPage'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const load = useCallback(() => {
    api<User>('/me')
      .then(setUser)
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401))
          setError(
            'Не удалось связаться с сервером. Проверьте подключение и повторите.',
          )
      })
      .finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])
  const logout = async () => {
    await api('/logout', 'POST', {})
    setUser(null)
    navigate('/')
  }
  if (loading)
    return (
      <div className="app-loading" role="status">
        Загружаем ваше пространство…
      </div>
    )
  if (error)
    return (
      <div className="app-loading">
        <p>{error}</p>
        <button
          className="button-primary"
          onClick={() => {
            setLoading(true)
            setError('')
            load()
          }}
        >
          Повторить
        </button>
      </div>
    )
  const home = user ? (isStaff(user) ? '/teacher' : '/dashboard') : '/'
  return (
    <Routes>
      <Route
        path="/"
        element={
          user ? (
            <Navigate to={home} replace />
          ) : (
            <LoginPage onLogin={setUser} />
          )
        }
      />
      <Route
        path="/teacher/*"
        element={
          !user ? (
            <Navigate to="/" replace />
          ) : isStaff(user) ? (
            <TeacherPage user={user} onLogout={logout} onUserChange={setUser} />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard"
        element={
          !user ? (
            <Navigate to="/" replace />
          ) : isStaff(user) ? (
            <Navigate to="/teacher" replace />
          ) : (
            <DashboardPage user={user} onLogout={logout} />
          )
        }
      />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  )
}
