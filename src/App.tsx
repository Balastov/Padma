import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { api, ApiError, isStaff } from './api'
import type { User } from './api'
import LoginPage from './pages/LoginPage'
import TeacherPage from './pages/TeacherPage'
import NotificationPrompt from './components/NotificationPrompt'
import StudentLayout from './layouts/StudentLayout'
import TodayPage from './pages/today/TodayPage'
import PathPage from './pages/path/PathPage'
import LessonsArchivePage, {
  LessonDetailPage,
} from './pages/lessons/LessonsArchivePage'
import LibraryPage, {
  LibraryMaterialPage,
} from './pages/library/LibraryPage'
import StudentSettingsPage from './pages/settings/StudentSettingsPage'
import WordsLayout from './pages/words/WordsLayout'
import DictionaryHub, {
  TopicsPage,
  TopicDetailPage,
  SubtopicWordsPage,
  LessonsWordsPage,
  CollectionsPage,
  CollectionDetailPage,
  WordDeepLinkPage,
} from './pages/words/DictionaryPages'
import TrainerHubPage from './pages/words/TrainerHubPage'
import TrainerSessionPage, {
  TrainerResultPage,
} from './pages/words/TrainerSessionPage'
import ProgressPage from './pages/words/ProgressPage'
import {
  enablePushSubscription,
  pushSupported,
  shouldShowNotifyPrompt,
} from './notifications'

function StudentRoutes({
  user,
  onLogout,
  onUserChange,
}: {
  user: User
  onLogout: () => Promise<void>
  onUserChange: (u: User) => void
}) {
  return (
    <Routes>
      <Route element={<StudentLayout user={user} onLogout={onLogout} />}>
        <Route path="today" element={<TodayPage user={user} />} />
        <Route path="path" element={<PathPage />} />
        <Route path="lessons" element={<LessonsArchivePage />} />
        <Route path="lessons/:lessonId" element={<LessonDetailPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="library/:materialId" element={<LibraryMaterialPage />} />
        <Route
          path="settings"
          element={
            <StudentSettingsPage
              user={user}
              onLogout={onLogout}
              onUserChange={onUserChange}
            />
          }
        />
        <Route path="words" element={<WordsLayout />}>
          <Route index element={<Navigate to="dictionary" replace />} />
          <Route path="dictionary" element={<DictionaryHub />} />
          <Route path="dictionary/topics" element={<TopicsPage />} />
          <Route
            path="dictionary/topics/:topicId"
            element={<TopicDetailPage />}
          />
          <Route
            path="dictionary/topics/:topicId/:subtopicId"
            element={<SubtopicWordsPage />}
          />
          <Route path="dictionary/lessons" element={<LessonsWordsPage />} />
          <Route
            path="dictionary/lessons/:lessonId"
            element={<LessonsWordsPage />}
          />
          <Route
            path="dictionary/collections"
            element={<CollectionsPage />}
          />
          <Route
            path="dictionary/collections/:collectionId"
            element={<CollectionDetailPage />}
          />
          <Route path="word/:wordId" element={<WordDeepLinkPage />} />
          <Route path="trainer" element={<TrainerHubPage />} />
          <Route
            path="trainer/session/:sessionId"
            element={<TrainerSessionPage />}
          />
          <Route
            path="trainer/result/:sessionId"
            element={<TrainerResultPage />}
          />
          <Route path="progress" element={<ProgressPage />} />
        </Route>
      </Route>
      <Route path="dashboard" element={<Navigate to="/today" replace />} />
      <Route
        path="dashboard/settings"
        element={<Navigate to="/settings" replace />}
      />
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  )
}

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
  useEffect(() => {
    if (!user?.notificationsEnabled || !pushSupported()) return
    if (Notification.permission !== 'granted') return
    void enablePushSubscription().catch(() => {})
  }, [user?.id, user?.notificationsEnabled])
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
  const home = user ? (isStaff(user) ? '/teacher' : '/today') : '/'
  return (
    <>
      {user && shouldShowNotifyPrompt(user) && (
        <NotificationPrompt user={user} onUserChange={setUser} />
      )}
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
              <TeacherPage
                user={user}
                onLogout={logout}
                onUserChange={setUser}
              />
            ) : (
              <Navigate to="/today" replace />
            )
          }
        />
        <Route
          path="/*"
          element={
            !user ? (
              <Navigate to="/" replace />
            ) : isStaff(user) ? (
              <Navigate to="/teacher" replace />
            ) : (
              <StudentRoutes
                user={user}
                onLogout={logout}
                onUserChange={setUser}
              />
            )
          }
        />
      </Routes>
    </>
  )
}
