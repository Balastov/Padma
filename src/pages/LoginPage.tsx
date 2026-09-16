import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, Lock, Mail, Users } from 'lucide-react'
import Logo from '../components/Logo'
import bgLogin from '../assets/bg-login.jpg'
import bgMobile from '../assets/bg-mobile.jpg'
import loginPortrait from '../assets/login-portrait.jpg'
import lakeCard from '../assets/lake-card.jpg'
import './LoginPage.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    navigate('/dashboard')
  }

  return (
    <div className="login">
      <div className="login__bg login__bg--desktop" style={{ backgroundImage: `url(${bgLogin})` }} />
      <div className="login__bg login__bg--mobile" style={{ backgroundImage: `url(${bgMobile})` }} />
      <div className="login__veil" />

      <p className="login__float login__float--quote">Лучшие версии нас рождаются в диалоге ♡</p>
      <p className="login__float login__float--right">
        БОЛЬШЕ, ЧЕМ УРОКИ.
        <br />
        БОЛЬШЕ О ВАС
      </p>
      <p className="login__float login__float--bottom">ЗНАНИЯ СОЕДИНЯЮТ ЛЮДЕЙ</p>

      <div className="login__shell">
        <aside className="login__visual">
          <img src={loginPortrait} alt="Учёба с Padma" className="login__portrait" />
        </aside>

        <section className="login__panel">
          <div className="login__brand login__brand--desktop">
            <Logo size="lg" centered />
          </div>
          <div className="login__brand login__brand--mobile">
            <Logo size="lg" centered />
          </div>

          <div className="login__intro">
            <h1>С возвращением.</h1>
            <p className="login__intro-desktop">
              Здесь — ваши уроки, практика и всё, что понадобится между встречами.
            </p>
            <p className="login__intro-mobile">Войдите в своё пространство Padma.</p>
          </div>

          <form className="login__form" onSubmit={handleSubmit}>
            <label className="login__field">
              <Mail size={18} strokeWidth={1.7} />
              <input
                type="text"
                placeholder="Email или телефон"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoComplete="username"
              />
            </label>

            <label className="login__field">
              <Lock size={18} strokeWidth={1.7} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="login__eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </label>

            <div className="login__links">
              <button type="button">Забыли пароль?</button>
              <button type="button">Войти по коду</button>
            </div>

            <button type="submit" className="login__submit">
              <span>Войти</span>
              <span className="login__submit-arrow" aria-hidden>
                <ArrowRight size={16} strokeWidth={2.4} />
              </span>
            </button>
          </form>

          <div className="login__divider login__divider--desktop">
            <span>или</span>
          </div>
          <div className="login__divider login__divider--mobile">
            <span>Ещё не занимаетесь?</span>
          </div>

          <button type="button" className="login__secondary login__secondary--desktop">
            <span className="login__secondary-icon">
              <Users size={18} strokeWidth={1.8} />
            </span>
            <span>Новый ученик Милады? Обсудить обучение →</span>
          </button>
          <button type="button" className="login__secondary login__secondary--mobile">
            Познакомиться с Милдой →
          </button>
        </section>
      </div>

      <article className="login__carousel">
        <img src={lakeCard} alt="" />
        <div className="login__carousel-copy">
          <p className="login__carousel-en">go at your own pace</p>
          <p className="login__carousel-ru">идти в своём темпе</p>
        </div>
        <div className="login__dots" aria-hidden>
          <span className="is-active" />
          <span />
          <span />
        </div>
      </article>
    </div>
  )
}
