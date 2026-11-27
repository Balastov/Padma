import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { KeyRound, Plus, Trash2 } from 'lucide-react'
import { startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser'
import { api } from '../api'
import { formatDeadline, useProviders } from '../quazar'
import { passkeyError, passkeysSupported } from '../passkeys'
import './BackupSignIn.css'

type Passkey = {
  id: string
  name: string
  created: number
  lastUsed: number | null
}

const RESCUE = `cd /var/www/padma/current
sudo -u padma env PADMA_DB=/var/lib/padma/padma.sqlite \\
  PADMA_URL=https://www.padma.ru \\
  /opt/padma/node/bin/node server/loginLink.mjs +7XXXXXXXXXX`

const day = (time: number) =>
  new Date(time).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })

/**
 * «Запасной вход» at the end of the settings, owners and administrators only:
 * passkeys and what to do when Quazar is unavailable (QUAZAR_SSO.md, 3.3).
 */
export default function BackupSignIn() {
  const { passwordDeadline } = useProviders()
  const [keys, setKeys] = useState<Passkey[] | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [supported] = useState(passkeysSupported)
  useEffect(() => {
    api<Passkey[]>('/passkeys')
      .then(setKeys)
      .catch((e) => setError((e as Error).message))
  }, [])

  async function add(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const optionsJSON = await api<PublicKeyCredentialCreationOptionsJSON>(
        '/passkeys/options',
        'POST',
        {},
      )
      const response = await startRegistration({ optionsJSON })
      const key = await api<Passkey>('/passkeys', 'POST', {
        response,
        name: name.trim(),
      })
      setKeys((list) => [...(list || []), key])
      setName('')
    } catch (e) {
      setError(passkeyError(e, 'Не удалось добавить ключ доступа'))
    } finally {
      setBusy(false)
    }
  }
  async function remove(key: Passkey) {
    setBusy(true)
    setError('')
    try {
      await api(`/passkeys/${encodeURIComponent(key.id)}`, 'DELETE', {})
      setKeys((list) => (list || []).filter((k) => k.id !== key.id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="backup-sign-in">
      <header>
        <h2>Запасной вход</h2>
        <p className="caption">
          Видят только владелец и администраторы.
          {passwordDeadline &&
            ` Вход по паролю для аккаунтов без Квазара отключится после ${formatDeadline(passwordDeadline)}`}
        </p>
      </header>
      <div className="glass-panel backup-sign-in__card">
        <h3>Ключи доступа</h3>
        <p className="caption">
          Вход по Touch ID, Face ID или PIN-коду устройства — без пароля и без
          Квазара. Ключ хранится в iCloud или Google и переходит на ваши новые
          устройства. В мобильном приложении Padma входите по ключу через
          браузер.
        </p>
        {keys && keys.length > 0 && (
          <ul className="backup-sign-in__keys">
            {keys.map((key) => (
              <li key={key.id}>
                <KeyRound size={18} />
                <span>
                  <strong>{key.name}</strong>
                  <small>
                    Добавлен {day(key.created)}
                    {key.lastUsed
                      ? ` · вход ${day(key.lastUsed)}`
                      : ' · ещё не использовался'}
                  </small>
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Удалить ключ «${key.name}»`}
                  disabled={busy}
                  onClick={() => remove(key)}
                >
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {keys && !keys.length && (
          <p className="notice">
            Ключей пока нет. Добавьте хотя бы один, чтобы войти, даже если
            Квазар недоступен.
          </p>
        )}
        {supported ? (
          <form className="backup-sign-in__add" onSubmit={add}>
            <label className="field">
              <span>Название ключа</span>
              <input
                maxLength={60}
                value={name}
                placeholder="Например, MacBook или iPhone"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="button-primary" disabled={busy}>
              <Plus size={18} />
              {busy ? 'Ждём подтверждения…' : 'Добавить ключ доступа'}
            </button>
          </form>
        ) : (
          <p className="notice">
            Здесь ключи доступа недоступны. Откройте Padma в браузере
            устройства.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="glass-panel backup-sign-in__card">
        <h3>Если Квазар недоступен</h3>
        <ol className="backup-sign-in__steps">
          <li>
            Есть ключ доступа — на странице входа нажмите «Войти по ключу
            доступа».
          </li>
          <li>
            У другого владельца или администратора открыт сеанс — пусть откроет
            вашу карточку в «Учениках» → «Все пользователи» и нажмёт «Ссылка для
            входа». Ссылка действует 15 минут, один раз.
          </li>
          <li>
            Иначе — по SSH на сервере (вместо +7XXXXXXXXXX — телефон или email
            аккаунта). Команда выведет такую же ссылку для любого аккаунта:
            <pre>{RESCUE}</pre>
          </li>
        </ol>
      </div>
    </section>
  )
}
