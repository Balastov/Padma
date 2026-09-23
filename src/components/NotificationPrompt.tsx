import { useState } from 'react'
import { Bell } from 'lucide-react'
import Modal from './Modal'
import {
  setPromptNeverAgain,
  setPromptSessionDismissed,
  enablePushSubscription,
} from '../notifications'
import { api } from '../api'
import type { User } from '../api'
import './NotificationPrompt.css'

export default function NotificationPrompt({
  user,
  onUserChange,
}: {
  user: User
  onUserChange: (user: User) => void
}) {
  const [busy, setBusy] = useState(false)
  const [neverAsk, setNeverAsk] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(true)

  if (!open) return null

  async function enable() {
    setBusy(true)
    setError('')
    try {
      await enablePushSubscription()
      const next = await api<User>('/profile', 'PATCH', {
        name: user.name,
        surname: user.surname,
        email: user.email,
        phone: user.phone || '',
        photo: user.photo,
        notificationsEnabled: true,
      })
      onUserChange(next)
      setOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function decline() {
    if (neverAsk) setPromptNeverAgain()
    else setPromptSessionDismissed()
    setOpen(false)
  }

  return (
    <Modal titleId="notify-prompt-title" onClose={decline}>
      <div className="notify-prompt">
        <div className="notify-prompt__icon" aria-hidden>
          <Bell size={28} />
        </div>
        <h2 id="notify-prompt-title">Включить уведомления?</h2>
        <p>
          Получайте информацию о новых сообщениях, уроках, домашних заданиях и
          ещё много всего полезного — даже когда Padma свёрнута или добавлена
          на экран «Домой».
        </p>
        {error && <p className="error">{error}</p>}
        <label className="notify-prompt__check">
          <input
            type="checkbox"
            checked={neverAsk}
            onChange={(e) => setNeverAsk(e.target.checked)}
            disabled={busy}
          />
          Больше не спрашивать
        </label>
        <div className="notify-prompt__actions">
          <button
            type="button"
            className="button-primary"
            onClick={enable}
            disabled={busy}
          >
            {busy ? 'Подключаем…' : 'Включить'}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={decline}
            disabled={busy}
          >
            Не включать
          </button>
        </div>
      </div>
    </Modal>
  )
}
