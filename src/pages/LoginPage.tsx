import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  Phone,
} from 'lucide-react'
import { startAuthentication } from '@simplewebauthn/browser'
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import { api } from '../api'
import type { User } from '../api'
import Logo from '../components/Logo'
import loginPortrait from '../assets/login-portrait.webp'
import loginPortraitSmall from '../assets/login-portrait-640.webp'
import { formatPhoneInput, isPhoneComplete, normalizePhone } from '../phone'
import {
  clearQuazarResult,
  quazarMessages,
  readQuazarResult,
  useProviders,
} from '../quazar'
import { passkeyError, passkeysSupported } from '../passkeys'
import './LoginPage.css'

/** Transparent 1×1 GIF. */
/** `?login=expired` after an old or used login link; removed from the address. */
function readLinkResult() {
  const url = new URL(window.location.href)
  if (url.searchParams.get('login') !== 'expired') return ''
  url.searchParams.delete('login')
  window.history.replaceState(window.history.state, '', url)
  return 'Ссылка для входа устарела или уже использована. Попросите новую.'
}

const EMPTY_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export default function LoginPage({
  onLogin,
}: {
  onLogin: (user: User) => void
}) {
  const [show, setShow] = useState(false)
  const [loginByEmail, setLoginByEmail] = useState(false)
  const [phone, setPhone] = useState('+7')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [help, setHelp] = useState('')
  const { quazar, passwordsClosed: closed } = useProviders()
  const [keyError, setKeyError] = useState('')
  const [quazarResult] = useState(readQuazarResult)
  const [linkResult] = useState(readLinkResult)
  const [passkeys] = useState(passkeysSupported)
  useEffect(clearQuazarResult, [])

  async function passkeyLogin() {
    setBusy(true)
    setKeyError('')
    try {
      const optionsJSON = await api<PublicKeyCredentialRequestOptionsJSON>(
        '/auth/passkey/options',
        'POST',
        {},
      )
      const response = await startAuthentication({ optionsJSON })
      onLogin(await api<User>('/auth/passkey', 'POST', { response }))
    } catch (e) {
      setKeyError(passkeyError(e, 'Не удалось войти по ключу доступа'))
    } finally {
      setBusy(false)
    }
  }

  const useEmail = loginByEmail

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (useEmail) {
        onLogin(await api<User>('/login', 'POST', { email, password }))
        return
      }
      if (!isPhoneComplete(phone)) {
        setError('Укажите полный номер телефона')
        return
      }
      onLogin(
        await api<User>('/login', 'POST', {
          phone: normalizePhone(phone),
          password,
        }),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <div className="login__shell glass-panel">
        <aside className="login__visual">
          {/* Hidden on phones: an empty source keeps them from downloading it. */}
          <picture>
            <source media="(max-width: 767px)" srcSet={EMPTY_IMAGE} />
            <img
              src={loginPortrait}
              srcSet={`${loginPortraitSmall} 640w, ${loginPortrait} 1086w`}
              sizes="(max-width: 1100px) 46vw, 490px"
              width={1086}
              height={1448}
              fetchPriority="high"
              alt="Девушка за учебным столом с книгами и кофе"
            />
          </picture>
        </aside>
        <section className="login__panel">
          <Logo size="lg" />
          {/* From the deadline on (stage 3.4) there is no password sign-in. */}
          {!closed && (
            <form onSubmit={submit} className="form-stack">
              {useEmail ? (
                <label className="field">
                  <span>Email</span>
                  <span className="input-icon">
                    <Mail size={20} />
                    <input
                      required
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Ваш email"
                    />
                  </span>
                </label>
              ) : (
                <label className="field">
                  <span>Телефон</span>
                  <span className="input-icon">
                    <Phone size={20} />
                    <input
                      required
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) =>
                        setPhone(formatPhoneInput(e.target.value))
                      }
                      placeholder="+7 (XXX) XXX-XX-XX"
                    />
                  </span>
                  <small>Номер другой страны — с её кодом, например +44.</small>
                </label>
              )}

              <div className="login__options">
                <label className="login__check">
                  <input
                    type="checkbox"
                    checked={loginByEmail}
                    onChange={(e) => setLoginByEmail(e.target.checked)}
                  />
                  <span>Авторизация по e-mail</span>
                </label>
              </div>

              <label className="field">
                <span>Пароль</span>
                <span className="input-icon">
                  <LockKeyhole size={20} />
                  <input
                    required
                    maxLength={128}
                    type={show ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Ваш пароль"
                  />
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setShow(!show)}
                    aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
                  >
                    {show ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </span>
              </label>
              <div className="login__links">
                <button
                  type="button"
                  onClick={() =>
                    setHelp(
                      'Для смены пароля обратитесь к вашему учителю или администратору Padma.',
                    )
                  }
                >
                  Забыли пароль?
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setHelp(
                      'Вход по коду пока недоступен. Используйте телефон или email и пароль, выданные администратором.',
                    )
                  }
                >
                  Войти по коду
                </button>
              </div>
              {help && (
                <p className="notice" role="status">
                  {help}
                </p>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button disabled={busy} className="button-primary login__submit">
                {busy ? 'Входим…' : 'Войти'}
                <ArrowRight size={20} />
              </button>
            </form>
          )}
          {linkResult && (
            <p className="error login__quazar-result" role="alert">
              {linkResult}
            </p>
          )}
          {quazarResult && (
            <p className="error login__quazar-result" role="alert">
              {quazarMessages[quazarResult]}
            </p>
          )}
          {quazar && (
            <div className="login__quazar">
              {!closed && <span className="login__or">или</span>}
              <a
                className={`${closed ? 'button-primary' : 'button-secondary'} login__quazar-button`}
                href="/api/auth/quazar/start"
              >
                Войти через Квазар
              </a>
              <p className="login__sign-up">
                Впервые в Padma?{' '}
                <a href="/api/auth/quazar/start?register=1">
                  Зарегистрироваться
                </a>
              </p>
            </div>
          )}
          {passkeys && (
            <div className="login__passkey">
              <button
                type="button"
                className="button-secondary login__passkey-button"
                disabled={busy}
                onClick={passkeyLogin}
              >
                <KeyRound size={20} />
                Войти по ключу доступа
              </button>
              <small>
                Для владельца и администраторов: Touch ID, Face ID или PIN-код
                устройства.
              </small>
              {keyError && (
                <p className="error" role="alert">
                  {keyError}
                </p>
              )}
            </div>
          )}
          <p className="login__foot">
            Ваши уроки, общение и маленькие шаги
            <br />к большим открытиям.
          </p>
        </section>
      </div>
    </main>
  )
}
