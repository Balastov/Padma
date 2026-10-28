import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Library, Trash2 } from 'lucide-react'
import { api, fullName, isManager } from '../../api'
import type { LibraryItem, User } from '../../api'
import { uploadAll } from '../../files'
import { FileLinks, FilePicker } from '../../components/Attachments'
import SectionStub from '../../components/SectionStub'
import '../library/Library.css'

type Props = { user: User; students: User[] }

export default function TeacherLibraryPage({ user, students }: Props) {
  const [items, setItems] = useState<LibraryItem[] | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [audience, setAudience] = useState<'all' | 'selected'>('all')
  const [chosen, setChosen] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const allLabel = isManager(user)
    ? 'Всем ученикам школы'
    : 'Всем моим ученикам'
  const refresh = useCallback(async () => {
    try {
      setItems(await api<LibraryItem[]>('/library'))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => {
    api<LibraryItem[]>('/library')
      .then(setItems)
      .catch((e) => setError(e.message))
  }, [])
  async function create(e: FormEvent) {
    e.preventDefault()
    if (!files.length) return setError('Прикрепите файл')
    setBusy(true)
    setError('')
    try {
      const [fileId] = await uploadAll(files)
      await api('/library', 'POST', {
        title,
        description,
        fileId,
        audience,
        studentIds: chosen,
      })
      setTitle('')
      setDescription('')
      setFiles([])
      setChosen([])
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function remove(item: LibraryItem) {
    if (!window.confirm(`Удалить «${item.title}» вместе с файлом?`)) return
    try {
      await api('/library/' + item.id, 'DELETE', {})
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }
  const audienceText = (item: LibraryItem) =>
    item.audience === 'all'
      ? item.authorId === user.id
        ? allLabel
        : 'Всем ученикам автора'
      : (item.studentIds || [])
          .map((id) => fullName(students.find((s) => s.id === id)))
          .join(', ')
  return (
    <div className="library-page">
      <header className="page-heading">
        <div>
          <h1>Библиотека</h1>
          <p>Материалы для учеников: PDF, документы, таблицы, изображения.</p>
        </div>
      </header>
      <form className="glass-panel library-form form-stack" onSubmit={create}>
        <h2>Новый материал</h2>
        <label className="field">
          <span>Название *</span>
          <input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span>
            Описание <small>необязательно</small>
          </span>
          <textarea
            rows={2}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <FilePicker files={files} onChange={setFiles} max={1} disabled={busy} />
        <div className="segmented">
          {(
            [
              ['all', allLabel],
              ['selected', 'Выбранным ученикам'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={audience === value}
              className={audience === value ? 'active' : ''}
              onClick={() => setAudience(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {audience === 'selected' && (
          <fieldset className="library-students">
            <legend>Ученики</legend>
            {students.map((s) => (
              <label key={s.id}>
                <input
                  type="checkbox"
                  checked={chosen.includes(s.id)}
                  onChange={(e) =>
                    setChosen(
                      e.target.checked
                        ? [...chosen, s.id]
                        : chosen.filter((id) => id !== s.id),
                    )
                  }
                />
                {fullName(s)}
              </label>
            ))}
            {!students.length && (
              <p className="secondary">Сначала добавьте учеников.</p>
            )}
          </fieldset>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            className="button-primary"
            disabled={
              busy ||
              !files.length ||
              (audience === 'selected' && !chosen.length)
            }
          >
            {busy ? 'Загружаем…' : 'Добавить в библиотеку'}
          </button>
        </div>
      </form>
      {items && !items.length && (
        <SectionStub
          icon={Library}
          title="Материалов пока нет"
          text="Добавленные материалы появятся здесь и у выбранных учеников."
        />
      )}
      {!!items?.length && (
        <div className="library-list">
          {items.map((item) => (
            <article key={item.id} className="glass-panel library-card">
              <strong>{item.title}</strong>
              {item.description && (
                <p className="secondary">{item.description}</p>
              )}
              <FileLinks files={item.file ? [item.file] : []} />
              <span className="library-card__meta">
                Доступно: {audienceText(item)}
              </span>
              <div className="library-card__actions">
                <button
                  type="button"
                  className="button-danger button-small"
                  onClick={() => void remove(item)}
                >
                  <Trash2 size={16} /> Удалить
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
