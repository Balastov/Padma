import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  Check,
  ChevronRight,
  Save,
  Search,
  Upload,
  Archive,
} from 'lucide-react'
import { api, fullName, isManager, roleNames } from '../api'
import type { Role, User } from '../api'
import Avatar from '../components/Avatar'
import NotificationHelp from '../components/NotificationHelp'
import QuazarLink from '../components/QuazarLink'
import AccountAccess from '../components/AccountAccess'
import { PRESET_AVATARS, isPresetAvatar } from '../avatars'
import {
  formatPhoneInput,
  isPhoneComplete,
  normalizePhone,
  phoneStarted,
} from '../phone'
import { syncPushWithPreference } from '../notifications'
import {
  DEFAULT_TIME_ZONE,
  deviceTimeZone,
  timeZoneOptions,
} from '../timeZones'

type Props = {
  user: User
  users: User[]
  refresh: () => Promise<void>
  profile?: boolean
  onUserChange?: (user: User) => void
}
export default function UsersPage({
  user,
  users,
  refresh,
  profile,
  onUserChange,
}: Props) {
  const [query, setQuery] = useState(''),
    [all, setAll] = useState(false),
    [selected, setSelected] = useState(profile ? user.id : '')
  const [notice, setNotice] = useState('')
  const filtered = users.filter(
    (u) =>
      (all || u.roles.includes('student')) &&
      `${fullName(u)} ${u.email} ${u.phone || ''}`.toLowerCase().includes(
        query.toLowerCase(),
      ),
  )
  const current =
    users.find((u) => u.id === selected) || (profile ? user : undefined)
  async function saved(next: User) {
    setSelected(next.id)
    setNotice('Изменения сохранены')
    if (profile) onUserChange?.(next)
    await refresh()
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{profile ? 'Мой профиль' : 'Ученики'}</h1>
          <p>
            {profile
              ? 'Ваши данные для входа и общения в Padma.'
              : 'Люди, с которыми вы открываете новое.'}
          </p>
        </div>
      </header>
      {notice && (
        <p className="success" role="status">
          <Check size={17} />
          {notice}
        </p>
      )}
      <div className={profile ? 'profile-editor' : 'users-layout'}>
        {!profile && (
          <section className="glass-panel users-list">
            <div className="section-heading">
              <h2>{all ? 'Пользователи' : 'Список учеников'}</h2>
            </div>
            <label className="input-icon">
              <Search size={20} />
              <input
                aria-label="Поиск пользователей"
                placeholder="Поиск по имени, email или телефону…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="segmented">
              <button
                className={!all ? 'active' : ''}
                onClick={() => setAll(false)}
              >
                Ученики
              </button>
              <button
                className={all ? 'active' : ''}
                onClick={() => setAll(true)}
              >
                Все пользователи
              </button>
            </div>
            <div className="users-list__items">
              {filtered.map((u) => (
                <button
                  className={`user-row${selected === u.id ? ' is-active' : ''}`}
                  key={u.id}
                  onClick={() => {
                    setSelected(u.id)
                    setNotice('')
                  }}
                >
                  <Avatar user={u} />
                  <span>
                    <strong>{fullName(u)}</strong>
                    <small>
                      {u.roles.map((r) => roleNames[r]).join(', ')}
                      {u.phoneNeedsFix && ' · проверьте номер'}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
              {!filtered.length && (
                <div className="empty-state">
                  <p>
                    {query
                      ? 'Никого не нашли. Попробуйте другое имя.'
                      : 'Здесь появятся ваши ученики.'}
                  </p>
                </div>
              )}
            </div>
            <p className="caption">
              {isManager(user) || user.roles.includes('teacher')
                ? 'Новые пользователи регистрируются сами: «Зарегистрироваться» на странице входа. Учителя назначает владелец или администратор. В чате и списках видны все пользователи.'
                : 'Здесь отображаются ваши ученики и ваш профиль.'}
            </p>
          </section>
        )}
        {current ? (
          <UserEditor
            key={current.id}
            initial={current}
            actor={user}
            users={users}
            profile={profile}
            onSaved={saved}
            onArchived={async () => {
              setSelected('')
              setNotice('Пользователь архивирован. История сохранена.')
              await refresh()
            }}
          />
        ) : (
          <section className="glass-panel user-editor empty-state">
            <div className="soft-icon">
              <Search size={30} />
            </div>
            <h2>Знакомство начинается здесь</h2>
            <p>
              Выберите ученика из списка.
            </p>
          </section>
        )}
      </div>
    </>
  )
}
const PHONE_HINT =
  'Укажите полный номер. Номер другой страны — с её кодом, например +44 7911 123456'
/** A stored number the server could not read is shown as it is, to be fixed. */
const shownPhone = (u: User) =>
  !u.phone ? '' : u.phoneNeedsFix ? u.phone : formatPhoneInput(u.phone)
function UserEditor({
  initial,
  actor,
  users,
  profile,
  onSaved,
  onArchived,
}: {
  initial: User
  actor: User
  users: User[]
  profile?: boolean
  onSaved: (u: User) => Promise<void>
  onArchived: () => Promise<void>
}) {
  const [form, setForm] = useState({
      ...initial,
      phone: shownPhone(initial),
      password: '',
      currentPassword: '',
    }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [pushWarning, setPushWarning] = useState(''),
    [helpOpen, setHelpOpen] = useState(false)
  const manager = isManager(actor)
  const editable =
    profile ||
    manager ||
    (!profile && initial.roles.every((r) => r === 'student'))
  const targetIsManager = form.roles.some(
    (role) => role === 'owner' || role === 'admin',
  )
  const notificationsEditable = editable && (!targetIsManager || manager)
  const timeZone = form.timeZone || DEFAULT_TIME_ZONE
  const device = deviceTimeZone()
  const field = (key: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  const phoneReady = isPhoneComplete(form.phone || '')
  const phoneTyped = phoneStarted(form.phone || '')
  const emailRequired = !phoneReady
  function emailLooksValid(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const email = (form.email || '').trim()
    if (!form.name.trim()) {
      setError('Укажите имя')
      return
    }
    if (!email && !phoneReady) {
      setError(
        phoneTyped
          ? 'Укажите полный номер телефона или email'
          : 'Укажите email или полный номер телефона',
      )
      return
    }
    if (email && !emailLooksValid(email)) {
      setError('Укажите корректный email')
      return
    }
    if (phoneTyped && !phoneReady) {
      setError(PHONE_HINT)
      return
    }
    if (form.password && form.password.length < 8) {
      setError('Пароль должен содержать от 8 до 128 символов')
      return
    }
    if (profile && form.password && !(form.currentPassword || '').trim()) {
      setError('Укажите текущий пароль')
      return
    }
    if (!form.roles.length) {
      setError('Выберите хотя бы одну роль')
      return
    }
    setBusy(true)
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        surname: (form.surname || '').trim(),
        email,
        phone: phoneReady ? normalizePhone(form.phone || '') : '',
      }
      const next = await api<User>(
        profile ? '/profile' : '/users/' + initial.id,
        'PATCH',
        payload,
      )
      if (profile && form.password) {
        window.location.assign('/')
        return
      }
      if (profile && actor.id === next.id) {
        try {
          await syncPushWithPreference(Boolean(next.notificationsEnabled))
          setPushWarning('')
        } catch (e) {
          // The flag is saved, but this device will not get notifications.
          if (next.notificationsEnabled) {
            setPushWarning(
              `Профиль сохранён, но уведомления на этом устройстве не включились. ${(e as Error).message}. Как это исправить — в инструкции ниже.`,
            )
            setHelpOpen(true)
          }
        }
      }
      await onSaved(next)
      setForm({
        ...next,
        phone: shownPhone(next),
        password: '',
        currentPassword: '',
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function archive() {
    setBusy(true)
    try {
      await api('/users/' + initial.id, 'DELETE', {})
      await onArchived()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function photo(file?: File) {
    if (!file) return
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 2_000_000
    ) {
      setError('Выберите JPG, PNG или WebP до 2 МБ')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      field('photo', reader.result)
      setError('')
    }
    reader.onerror = () => setError('Не удалось прочитать файл')
    reader.readAsDataURL(file)
  }
  return (
    <section className="glass-panel user-editor">
      <div className="user-editor__head">
        <Avatar user={form} large />
        <div>
          <h2>{fullName(form)}</h2>
          <p>{form.roles.map((r) => roleNames[r]).join(' · ')}</p>
        </div>
      </div>
      {!editable && (
        <p className="notice">
          Изменение этого профиля доступно владельцу и администратору.
        </p>
      )}
      <form className="form-stack" onSubmit={submit} noValidate>
        <fieldset disabled={!editable || busy}>
          <div className="form-two">
            <label className="field">
              <span>Имя *</span>
              <input
                required
                maxLength={80}
                value={form.name}
                onChange={(e) => field('name', e.target.value)}
              />
            </label>
            <label className="field">
              <span>Фамилия</span>
              <input
                maxLength={80}
                value={form.surname}
                onChange={(e) => field('surname', e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            <span>{emailRequired ? 'Email для входа *' : 'Email для входа'}</span>
            <input
              type="email"
              value={form.email}
              autoComplete="off"
              onChange={(e) => field('email', e.target.value)}
            />
            <small>
              {emailRequired
                ? 'Обязателен, если телефон не заполнен полностью.'
                : 'Можно не указывать, если задан телефон для входа.'}
            </small>
          </label>
          <label className="field">
            <span>Телефон для входа</span>
            <input
              type="tel"
              inputMode="tel"
              value={form.phone || ''}
              autoComplete="off"
              placeholder="+7 (XXX) XXX-XX-XX"
              readOnly={initial.quazarLinked}
              onChange={(e) => field('phone', formatPhoneInput(e.target.value))}
            />
            <small>
              {initial.quazarLinked
                ? 'Подтверждён в Квазаре и меняется только там.'
                : 'Можно войти по номеру. Номер другой страны — с её кодом, например +44.'}
            </small>
            {initial.phoneNeedsFix && (
              <small className="field__warning">
                Номер не распознан. Укажите его полностью, с кодом страны.
              </small>
            )}
          </label>
          {form.roles.includes('student') && (
            <label className="field">
              <span>Часовой пояс</span>
              <select
                value={timeZone}
                onChange={(e) => field('timeZone', e.target.value)}
              >
                {timeZoneOptions(timeZone).map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.label}
                  </option>
                ))}
              </select>
              <small>
                По нему считаются дни практики и серия в прогрессе слов.
                {profile && device && device !== timeZone && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => field('timeZone', device)}
                    >
                      Как на этом устройстве
                    </button>
                  </>
                )}
              </small>
            </label>
          )}
          <label className="field field--check">
            <span className="field__check">
              <input
                type="checkbox"
                checked={Boolean(form.notificationsEnabled)}
                disabled={!notificationsEditable}
                onChange={(e) =>
                  field('notificationsEnabled', e.target.checked)
                }
              />
              Уведомления
            </span>
            <small>
              Сообщения и важные события Padma на этом устройстве и в браузере.
            </small>
          </label>
          {profile && pushWarning && (
            <p className="error" role="alert">
              {pushWarning}
            </p>
          )}
          {profile && (
            <NotificationHelp open={helpOpen} onToggle={setHelpOpen} />
          )}
          {initial.quazarLinked ||
          (profile && initial.hasPassword === false) ? (
            <p className="notice">
              {profile
                ? 'Вы входите через Квазар, пароль не нужен.'
                : 'Пользователь входит через Квазар, пароль не нужен.'}
            </p>
          ) : (
            <label className="field">
              <span>Новый пароль</span>
              <input
                type="password"
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => field('password', e.target.value)}
                placeholder="Оставьте пустым, чтобы сохранить текущий"
              />
              <small>Смена пароля завершит активные сеансы пользователя.</small>
            </label>
          )}
          {profile && form.password && (
            <label className="field">
              <span>Текущий пароль *</span>
              <input
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={(e) => field('currentPassword', e.target.value)}
              />
            </label>
          )}
          {(!profile || manager) && (
            <label className="field">
              <span>Учитель</span>
              <select
                value={form.teacherId || ''}
                disabled={!manager}
                onChange={(e) => field('teacherId', e.target.value || null)}
              >
                <option value="">Пока не назначен</option>
                {users
                  .filter((u) => u.roles.includes('teacher'))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {fullName(u)}
                    </option>
                  ))}
              </select>
              {profile && manager && (
                <small>Свою роль учителя и назначение может менять владелец и администратор.</small>
              )}
            </label>
          )}
          {manager && (
            <fieldset className="roles">
              <legend>Роли *</legend>
              {(Object.keys(roleNames) as Role[]).map((role) => (
                <label key={role}>
                  <input
                    type="checkbox"
                    checked={form.roles.includes(role)}
                    onChange={(e) =>
                      field(
                        'roles',
                        e.target.checked
                          ? [...form.roles, role]
                          : form.roles.filter((r) => r !== role),
                      )
                    }
                  />
                  {roleNames[role]}
                </label>
              ))}
            </fieldset>
          )}
          {form.roles.includes('student') && (
            <fieldset className="avatar-picker">
              <legend>Аватарка</legend>
              <div className="avatar-picker__grid">
                {PRESET_AVATARS.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    className={form.photo === src ? 'is-selected' : ''}
                    aria-pressed={form.photo === src}
                    aria-label={`Аватарка ${i + 1}`}
                    onClick={() => field('photo', src)}
                  >
                    <img src={src} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
              <small>
                {form.photo && !isPresetAvatar(form.photo)
                  ? 'Сейчас стоит своё фото. Выберите аватарку из набора или загрузите другое фото.'
                  : 'Выберите аватарку из набора или загрузите своё фото.'}
              </small>
            </fieldset>
          )}
          <label className="photo-upload">
            <Upload size={18} />
            <span>
              {form.roles.includes('student') ? 'Загрузить своё фото' : 'Загрузить фото'}{' '}
              <small>JPG, PNG, WebP · до 2 МБ</small>
            </span>
            <input
              aria-label="Фото пользователя"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => photo(e.target.files?.[0])}
            />
          </label>
          {/* A student always has an avatar: pick another instead. */}
          {form.photo && !form.roles.includes('student') && (
            <button
              className="text-button"
              type="button"
              onClick={() => field('photo', '')}
            >
              Убрать фото
            </button>
          )}
          <div className="form-actions">
            <button
              type="submit"
              className="button-primary"
              disabled={!form.roles.length}
            >
              <Save size={19} />
              {busy ? 'Сохраняем…' : 'Сохранить изменения'}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setForm({
                  ...initial,
                  phone: shownPhone(initial),
                  password: '',
                  currentPassword: '',
                })
                setError('')
              }}
            >
              Сбросить
            </button>
          </div>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
      {profile && <QuazarLink user={initial} />}
      {!profile && manager && initial.id !== actor.id && (
        <AccountAccess key={initial.id} user={initial} onDone={onSaved} />
      )}
      {manager &&
        initial.roles.every((r) => r === 'student' || r === 'guest') && (
          <div className="archive-area">
            {confirm ? (
              <>
                <p>
                  Архивировать {fullName(initial)}? Вход будет закрыт, история
                  останется в базе.
                </p>
                <div className="form-actions">
                  <button
                    className="button-danger"
                    disabled={busy}
                    onClick={archive}
                  >
                    Архивировать
                  </button>
                  <button
                    className="button-secondary"
                    onClick={() => setConfirm(false)}
                  >
                    Оставить
                  </button>
                </div>
              </>
            ) : (
              <button
                className="text-button danger-text"
                onClick={() => setConfirm(true)}
              >
                <Archive size={17} />
                Архивировать пользователя
              </button>
            )}
          </div>
        )}
    </section>
  )
}
