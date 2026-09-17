import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Phone } from 'lucide-react'
import { api } from '../api'
import type { User } from '../api'
import Logo from '../components/Logo'
import loginPortrait from '../assets/login-portrait-v3.png'
import {
  formatForeignPhoneInput,
  formatRuPhoneInput,
  isCompleteRuPhone,
  isValidForeignPhone,
  normalizePhone,
} from '../phone'
import './LoginPage.css'

export default function LoginPage({
  onLogin,
}: {
  onLogin: (user: User) => void
}) {
  const [show, setShow] = useState(false)
  const [foreignPhone, setForeignPhone] = useState(false)
  const [loginByEmail, setLoginByEmail] = useState(false)
  const [phone, setPhone] = useState('+7')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [help, setHelp] = useState('')

  const useEmail = loginByEmail

  function onPhoneChange(value: string) {
    setPhone(
      foreignPhone ? formatForeignPhoneInput(value) : formatRuPhoneInput(value),
    )
  }

  function onForeignToggle(checked: boolean) {
    setForeignPhone(checked)
    if (checked) {
      setPhone(formatForeignPhoneInput(phone.replace(/\D/g, '') || ''))
    } else {
      setPhone(formatRuPhoneInput(phone || '7'))
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (useEmail) {
        onLogin(await api<User>('/login', 'POST', { email, password }))
        return
      }
      if (foreignPhone) {
        if (!isValidForeignPhone(phone)) {
          setError('Укажите номер: только цифры, можно с + в начале')
          return
        }
        onLogin(
          await api<User>('/login', 'POST', {
            phone: normalizePhone(phone, true),
            password,
          }),
        )
        return
      }
      if (!isCompleteRuPhone(phone)) {
        setError('Укажите полный номер телефона')
        return
      }
      onLogin(
        await api<User>('/login', 'POST', {
          phone: normalizePhone(phone, false),
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
                    onChange={(e) => onPhoneChange(e.target.value)}
                    placeholder={
                      foreignPhone ? '+ и цифры' : '+7 (999) 123-45-67'
                    }
                  />
                </span>
              </label>
            )}

            <div className="login__options">
              <label className="login__check">
                <input
                  type="checkbox"
                  checked={foreignPhone}
                  onChange={(e) => onForeignToggle(e.target.checked)}
                />
                <span>У меня иностранный номер телефона</span>
              </label>
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
          <p className="login__foot">
            Ваши уроки, общение и маленькие шаги
            <br />к большим открытиям.
          </p>
        </section>
      </div>
    </main>
  )
}
