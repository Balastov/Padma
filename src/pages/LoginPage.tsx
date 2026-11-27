import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Phone } from 'lucide-react'
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
  useQuazarEnabled,
} from '../quazar'
import './LoginPage.css'

/** Transparent 1×1 GIF. */
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
  const quazar = useQuazarEnabled()
  const [quazarResult] = useState(readQuazarResult)
  useEffect(clearQuazarResult, [])

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
                    onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
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
          {quazarResult && (
            <p className="error login__quazar-result" role="alert">
              {quazarMessages[quazarResult]}
            </p>
          )}
          {quazar && (
            <div className="login__quazar">
              <span className="login__or">или</span>
              <a
                className="button-secondary login__quazar-button"
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
          <p className="login__foot">
            Ваши уроки, общение и маленькие шаги
            <br />к большим открытиям.
          </p>
        </section>
      </div>
    </main>
  )
}
