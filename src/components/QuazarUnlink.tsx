import { useState } from 'react'
import type { FormEvent } from 'react'
import { Unlink } from 'lucide-react'
import { api } from '../api'
import type { User } from '../api'
import './QuazarLink.css'

/** «Отвязать Квазар» for owner and admin: the user gets a new password. */
export default function QuazarUnlink({
  user,
  onDone,
}: {
  user: User
  onDone: (user: User) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password.length < 8) {
      setError('Пароль должен содержать от 8 до 128 символов')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onDone(
        await api<User>(`/users/${user.id}/quazar`, 'DELETE', { password }),
      )
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="quazar-link">
      <h3>Квазар</h3>
      <p className="quazar-link__text">
        Аккаунт привязан: вход только через Квазар. Отвязка снова откроет вход
        по паролю и завершит сеансы пользователя.
      </p>
      {open ? (
        <form className="form-stack quazar-link__form" onSubmit={submit}>
          <label className="field">
            <span>Новый пароль для входа *</span>
            <input
              required
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <small>Передайте пароль пользователю лично.</small>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="button-danger" disabled={busy}>
              {busy ? 'Отвязываем…' : 'Отвязать'}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setOpen(false)
                setPassword('')
                setError('')
              }}
            >
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="button-secondary"
          onClick={() => setOpen(true)}
        >
          <Unlink size={18} />
          Отвязать Квазар
        </button>
      )}
    </div>
  )
}
