import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ImagePlus, RotateCcw } from 'lucide-react'
import { api } from '../api'
import {
  BLUR_DEFAULT,
  TINT_DEFAULT,
  prepareBackground,
  useAppearance,
} from '../appearance'
import type { Background } from '../appearance'
import './AppearanceSettings.css'

type Scope = 'mine' | 'default'

function BackgroundEditor({
  scope,
  title,
  hint,
  saved,
  active,
  onActivate,
}: {
  scope: Scope
  title: string
  hint: string
  saved: Background | null
  active: boolean
  onActivate: (preview: Background | null | undefined) => void
}) {
  const { reload } = useAppearance()
  const [image, setImage] = useState('')
  const [blur, setBlur] = useState(saved?.blur ?? BLUR_DEFAULT)
  const [tint, setTint] = useState(saved?.tint ?? TINT_DEFAULT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const url = image || saved?.url || ''
  const dirty =
    !!image || blur !== (saved?.blur ?? BLUR_DEFAULT) || tint !== (saved?.tint ?? TINT_DEFAULT)
  const draft = url ? { url, blur, tint } : null

  function change(next: { image?: string; blur?: number; tint?: number }) {
    const value = {
      url: next.image || url,
      blur: next.blur ?? blur,
      tint: next.tint ?? tint,
    }
    if (next.image !== undefined) setImage(next.image)
    if (next.blur !== undefined) setBlur(next.blur)
    if (next.tint !== undefined) setTint(next.tint)
    setNotice('')
    if (value.url) onActivate(value)
  }

  async function pick(file: File | undefined) {
    if (!file) return
    setError('')
    try {
      change({ image: await prepareBackground(file) })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      await api(`/appearance/${scope}`, 'PUT', {
        ...(image ? { image } : {}),
        blur,
        tint,
      })
      setImage('')
      await reload()
      onActivate(undefined)
      setNotice('Фон сохранён')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    setBusy(true)
    setError('')
    try {
      await api(`/appearance/${scope}`, 'DELETE')
      setImage('')
      setBlur(BLUR_DEFAULT)
      setTint(TINT_DEFAULT)
      await reload()
      onActivate(undefined)
      setNotice('Возвращён стандартный фон')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    setImage('')
    setBlur(saved?.blur ?? BLUR_DEFAULT)
    setTint(saved?.tint ?? TINT_DEFAULT)
    onActivate(undefined)
  }

  return (
    <section className="glass-panel appearance-card">
      <div>
        <h3>{title}</h3>
        <p className="caption">{hint}</p>
      </div>
      <div
        className="appearance-preview"
        style={
          draft
            ? ({
                '--preview-image': `url("${draft.url}")`,
                '--preview-blur': `${Math.round(draft.blur / 3)}px`,
                '--preview-tint': draft.tint / 100,
              } as CSSProperties)
            : undefined
        }
      >
        {draft && <div className="appearance-preview__image" />}
        {draft && <div className="appearance-preview__tint" />}
        <div className="appearance-preview__glass glass-panel">
          <strong>Liquid Glass</strong>
          <span>{draft ? 'Так выглядят панели' : 'Стандартный фон'}</span>
        </div>
      </div>
      <div className="appearance-actions">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <button
          type="button"
          className="button-secondary button-small"
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={16} /> {url ? 'Заменить изображение' : 'Выбрать изображение'}
        </button>
        {saved && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={reset}
          >
            <RotateCcw size={14} /> Вернуть стандартный фон
          </button>
        )}
      </div>
      <label className="appearance-range">
        <span>
          Размытие <output>{blur}</output>
        </span>
        <input
          type="range"
          min={0}
          max={60}
          value={blur}
          disabled={!url}
          onChange={(e) => change({ blur: Number(e.target.value) })}
        />
      </label>
      <label className="appearance-range">
        <span>
          Осветление <output>{tint}%</output>
        </span>
        <input
          type="range"
          min={0}
          max={90}
          value={tint}
          disabled={!url}
          onChange={(e) => change({ tint: Number(e.target.value) })}
        />
      </label>
      {active && dirty && (
        <p className="caption">
          Предпросмотр показан на всём сайте. Сохраните, чтобы применить.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="caption" role="status">
          {notice}
        </p>
      )}
      <div className="appearance-actions">
        <button
          type="button"
          className="button-primary button-small"
          disabled={busy || !url || !dirty}
          onClick={save}
        >
          {busy ? 'Сохраняем…' : 'Сохранить фон'}
        </button>
        {dirty && (
          <button
            type="button"
            className="button-secondary button-small"
            disabled={busy}
            onClick={cancel}
          >
            Отменить
          </button>
        )}
      </div>
    </section>
  )
}

/** Background settings: teacher's own and, for admins, the site default. */
export default function AppearanceSettings() {
  const { appearance, setPreview } = useAppearance()
  const [editing, setEditing] = useState<Scope | ''>('')

  useEffect(() => () => setPreview(undefined), [setPreview])

  if (!appearance?.canEditMine && !appearance?.canEditDefault) return null
  const activate = (scope: Scope) => (preview: Background | null | undefined) => {
    setEditing(preview === undefined ? '' : scope)
    setPreview(preview)
  }
  return (
    <section className="appearance">
      <header>
        <h2>Оформление</h2>
        <p className="caption">
          Фоновое изображение видно за стеклянными панелями, размытое.
        </p>
      </header>
      <div className="appearance-grid">
        {appearance.canEditMine && (
          <BackgroundEditor
            key="mine"
            scope="mine"
            title="Мой фон"
            hint="Видите вы и ваши ученики."
            saved={appearance.mine || null}
            active={editing === 'mine'}
            onActivate={activate('mine')}
          />
        )}
        {appearance.canEditDefault && (
          <BackgroundEditor
            key="default"
            scope="default"
            title="Фон по умолчанию"
            hint="Для страницы входа и для всех, чей преподаватель не выбрал свой фон."
            saved={appearance.default || null}
            active={editing === 'default'}
            onActivate={activate('default')}
          />
        )}
      </div>
    </section>
  )
}
