import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link2, LockKeyhole } from 'lucide-react'
import { api } from '../api'
import type { User } from '../api'
import {
  clearQuazarResult,
  quazarMessages,
  readQuazarResult,
  useQuazarEnabled,
} from '../quazar'
import './QuazarLink.css'

/** «Привязать Квазар» in the own profile: password again, then Quazar. */
export default function QuazarLink({ user }: { user: User }) {
  const enabled = useQuazarEnabled()
  const [result] = useState(readQuazarResult)
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(clearQuazarResult, [])
  if (!user.quazarLinked && !enabled) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { url } = await api<{ url: string }>('/auth/quazar/link', 'POST', {
        password,
        returnTo: window.location.pathname,
      })
      window.location.assign(url)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="quazar-link">
      <h3>Квазар</h3>
      {result && (
        <p
          className={result === 'linked' ? 'success' : 'error'}
          role={result === 'linked' ? 'status' : 'alert'}
        >
          {quazarMessages[result]}
        </p>
      )}
      {user.quazarLinked ? (
        <p className="quazar-link__text">
          Аккаунт привязан: входите через Квазар. Номер телефона подтверждён там
          и меняется только в Квазаре.
        </p>
      ) : (
        <>
          <p className="quazar-link__text">
            Привяжите аккаунт Квазара, чтобы входить в Padma без пароля. Номер в
            Квазаре должен совпадать с номером в Padma.
          </p>
          {open ? (
            <form className="form-stack quazar-link__form" onSubmit={submit}>
              <label className="field">
                <span>Пароль Padma</span>
                <span className="input-icon">
                  <LockKeyhole size={20} />
                  <input
                    required
                    type="password"
                    maxLength={128}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </span>
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button className="button-primary" disabled={busy}>
                  {busy ? 'Переходим…' : 'Продолжить в Квазаре'}
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
              <Link2 size={18} />
              Привязать Квазар
            </button>
          )}
        </>
      )}
    </div>
  )
}
