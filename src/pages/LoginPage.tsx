import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { api } from '../api'
import type { User } from '../api'
import Logo from '../components/Logo'
import loginPortrait from '../assets/login-portrait-v3.png'
import './LoginPage.css'
export default function LoginPage({
  onLogin,
}: {
  onLogin: (user: User) => void
}) {
  const [show, setShow] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [help, setHelp] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      onLogin(await api<User>('/login', 'POST', { email, password }))
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
          <img
            src={loginPortrait}
            alt="Девушка за учебным столом с книгами и кофе"
          />
        </aside>
        <section className="login__panel">
          <Logo size="lg" centered />
          <div className="login__intro">
            <h1>Добро пожаловать.</h1>
            <p>Войдите в своё пространство Padma.</p>
          </div>
          <form onSubmit={submit} className="form-stack">
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
                    'Вход по коду пока недоступен. Используйте email и пароль, выданные администратором.',
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
          <p className="login__foot">
            Ваши уроки, общение и маленькие шаги
            <br />к большим открытиям.
          </p>
        </section>
      </div>
    </main>
  )
}
