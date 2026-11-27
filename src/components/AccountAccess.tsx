import { useState } from 'react'
import { Copy, KeyRound, Link2, Unlink } from 'lucide-react'
import { api, isManager } from '../api'
import type { User } from '../api'
import { formatPhoneInput } from '../phone'
import './QuazarLink.css'

type Action = 'unlink' | 'reset'

/**
 * «Вход» in a user's card for the owner and administrators: unlink Quazar,
 * reset the password, a one-time login link (QUAZAR_SSO.md, stage 3.3).
 */
export default function AccountAccess({
  user,
  onDone,
}: {
  user: User
  onDone: (user: User) => Promise<void>
}) {
  const [confirm, setConfirm] = useState<Action | null>(null)
  const [link, setLink] = useState<{ url: string; expires: number } | null>(
    null,
  )
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const phone = user.phone ? formatPhoneInput(user.phone) : ''

  async function run(action: Action) {
    setBusy(true)
    setError('')
    try {
      await onDone(
        await api<User>(
          `/users/${user.id}/${action === 'unlink' ? 'quazar' : 'password'}`,
          'DELETE',
          {},
        ),
      )
      setConfirm(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function issueLink() {
    setBusy(true)
    setError('')
    setCopied(false)
    try {
      setLink(
        await api<{ url: string; expires: number }>(
          `/users/${user.id}/login-link`,
          'POST',
          {},
        ),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link!.url)
      setCopied(true)
    } catch {
      setError('Не удалось скопировать: выделите ссылку вручную')
    }
  }

  const status = user.quazarLinked
    ? `Входит через Квазар${
        user.quazarClaimedAt
          ? `. Привязан при входе через Квазар ${new Date(
              user.quazarClaimedAt,
            ).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}.`
          : '.'
      }`
    : user.hasPassword
      ? 'Входит по паролю: Квазар не привязан.'
      : `Пароля нет: при входе через Квазар с номером ${phone || '—'} аккаунт привяжется сам.`

  return (
    <div className="quazar-link">
      <h3>Вход</h3>
      <p className="quazar-link__text">{status}</p>
      {confirm ? (
        <>
          <p className="quazar-link__text">
            {confirm === 'unlink'
              ? 'Связь с Квазаром снимется, пароля не будет, сеансы пользователя завершатся.'
              : 'Пароль сотрётся, сеансы пользователя завершатся.'}{' '}
            Пользователь снова войдёт через Квазар с номером {phone}.
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="button-danger"
              disabled={busy}
              onClick={() => run(confirm)}
            >
              {confirm === 'unlink' ? 'Отвязать' : 'Сбросить'}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setConfirm(null)}
            >
              Отмена
            </button>
          </div>
        </>
      ) : (
        <div className="quazar-link__actions">
          {user.quazarLinked && (
            <button
              type="button"
              className="button-secondary"
              onClick={() => setConfirm('unlink')}
            >
              <Unlink size={18} />
              Отвязать Квазар
            </button>
          )}
          {!user.quazarLinked && user.hasPassword && (
            <button
              type="button"
              className="button-secondary"
              onClick={() => setConfirm('reset')}
            >
              <KeyRound size={18} />
              Сбросить пароль
            </button>
          )}
          {isManager(user) && (
            <button
              type="button"
              className="button-secondary"
              disabled={busy}
              onClick={issueLink}
            >
              <Link2 size={18} />
              Ссылка для входа
            </button>
          )}
        </div>
      )}
      {link && (
        <div className="quazar-link__login-link">
          <input
            readOnly
            aria-label="Ссылка для входа"
            value={link.url}
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            className="button-secondary button-small"
            onClick={copy}
          >
            <Copy size={16} />
            {copied ? 'Скопировано' : 'Копировать'}
          </button>
          <small>
            Действует до{' '}
            {new Date(link.expires).toLocaleTimeString('ru-RU', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Europe/Moscow',
            })}{' '}
            по Москве, один раз. Передайте лично — она открывает аккаунт без
            пароля и без Квазара.
          </small>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
