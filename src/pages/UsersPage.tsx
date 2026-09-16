import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  Check,
  ChevronRight,
  Plus,
  Save,
  Search,
  Upload,
  Archive,
} from 'lucide-react'
import { api, fullName, isManager, roleNames } from '../api'
import type { Role, User } from '../api'
import Avatar from '../components/Avatar'

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
    [selected, setSelected] = useState(profile ? user.id : ''),
    [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  const filtered = users.filter(
    (u) =>
      (all || u.roles.includes('student')) &&
      `${fullName(u)} ${u.email}`.toLowerCase().includes(query.toLowerCase()),
  )
  const current =
    users.find((u) => u.id === selected) || (profile ? user : undefined)
  const blank: User = {
    id: '',
    name: '',
    surname: '',
    email: '',
    roles: ['student'],
    teacherId: user.roles.includes('teacher') ? user.id : null,
    photo: '',
  }
  async function saved(next: User) {
    setAdding(false)
    setSelected(next.id)
    setNotice('Изменения сохранены')
    if (profile) onUserChange?.(next)
    await refresh()
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{profile ? 'Настройки' : 'Ученики'}</h1>
          <p>
            {profile
              ? 'Ваш профиль и данные для входа.'
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
              <button
                className="button-primary button-small"
                onClick={() => {
                  setAdding(true)
                  setSelected('')
                  setNotice('')
                }}
              >
                <Plus size={18} />
                <span>Добавить</span>
              </button>
            </div>
            <label className="input-icon">
              <Search size={20} />
              <input
                aria-label="Поиск пользователей"
                placeholder="Поиск по имени или email…"
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
                  className={`user-row${selected === u.id && !adding ? ' is-active' : ''}`}
                  key={u.id}
                  onClick={() => {
                    setSelected(u.id)
                    setAdding(false)
                    setNotice('')
                  }}
                >
                  <Avatar user={u} />
                  <span>
                    <strong>{fullName(u)}</strong>
                    <small>{u.roles.map((r) => roleNames[r]).join(', ')}</small>
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
                  {!query && (
                    <button
                      className="text-button"
                      onClick={() => setAdding(true)}
                    >
                      Добавить первого ученика
                    </button>
                  )}
                </div>
              )}
            </div>
            <p className="caption">
              {isManager(user)
                ? 'Вам доступны все пользователи Padma.'
                : 'Здесь отображаются ваши ученики и ваш профиль.'}
            </p>
          </section>
        )}
        {adding || current ? (
          <UserEditor
            key={adding ? 'new' : current!.id}
            initial={adding ? blank : current!}
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
              Выберите ученика из списка
              <br />
              или добавьте нового.
            </p>
          </section>
        )}
      </div>
    </>
  )
}
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
      password: '',
      currentPassword: '',
    }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false)
  const manager = isManager(actor)
  const editable =
    profile ||
    manager ||
    (!profile && initial.roles.every((r) => r === 'student'))
  const field = (key: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const next = await api<User>(
        profile ? '/profile' : '/users' + (initial.id ? '/' + initial.id : ''),
        initial.id ? 'PATCH' : 'POST',
        form,
      )
      if (profile && form.password) {
        window.location.assign('/')
        return
      }
      await onSaved(next)
      setForm({ ...next, password: '', currentPassword: '' })
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
      file.size > 1000000
    ) {
      setError('Выберите JPG, PNG или WebP до 1 МБ')
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
          <h2>{initial.id ? fullName(form) : 'Новый ученик'}</h2>
          <p>{form.roles.map((r) => roleNames[r]).join(' · ')}</p>
        </div>
      </div>
      {!editable && (
        <p className="notice">
          Изменение этого профиля доступно владельцу и администратору.
        </p>
      )}
      <form className="form-stack" onSubmit={submit}>
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
            <span>Email для входа *</span>
            <input
              type="email"
              required
              readOnly={profile}
              value={form.email}
              autoComplete="off"
              onChange={(e) => field('email', e.target.value)}
            />
          </label>
          <label className="field">
            <span>{initial.id ? 'Новый пароль' : 'Пароль *'}</span>
            <input
              type="password"
              minLength={10}
              maxLength={128}
              required={!initial.id}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => field('password', e.target.value)}
              placeholder={
                initial.id
                  ? 'Оставьте пустым, чтобы сохранить текущий'
                  : 'Не менее 10 символов'
              }
            />
            <small>
              {initial.id
                ? 'Смена пароля завершит активные сеансы пользователя.'
                : 'Передайте пароль ученику лично.'}
            </small>
          </label>
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
          {!profile && (
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
            </label>
          )}
          {manager && !profile && (
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
          <label className="photo-upload">
            <Upload size={18} />
            <span>
              Загрузить фото <small>JPG, PNG, WebP · до 1 МБ</small>
            </span>
            <input
              aria-label="Фото пользователя"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => photo(e.target.files?.[0])}
            />
          </label>
          {form.photo && (
            <button
              className="text-button"
              type="button"
              onClick={() => field('photo', '')}
            >
              Убрать фото
            </button>
          )}
          <div className="form-actions">
            <button className="button-primary" disabled={!form.roles.length}>
              <Save size={19} />
              {busy ? 'Сохраняем…' : 'Сохранить изменения'}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setForm({ ...initial, password: '', currentPassword: '' })
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
      {manager &&
        initial.id &&
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
