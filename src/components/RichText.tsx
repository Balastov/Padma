import { useRef, useState } from 'react'
import { Link2 } from 'lucide-react'
import './RichText.css'

// Homework text keeps links as [word](https://…), like a link on a word in
// a messenger; bare http(s) addresses become links too.
const TOKEN = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g

/** Text with links; line breaks are kept by the parent's CSS. */
export function RichText({ text }: { text: string }) {
  const parts: (string | { label: string; href: string })[] = []
  let last = 0
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0
    if (index > last) parts.push(text.slice(last, index))
    parts.push(
      match[1]
        ? { label: match[1], href: match[2] }
        : { label: match[3], href: match[3] },
    )
    last = index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return (
    <>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">
            {part.label}
          </a>
        ),
      )}
    </>
  )
}

// A fresh expression: test() on the shared global one would move its
// lastIndex, and matchAll() in RichText starts from there.
const hasLinks = (text: string) => new RegExp(TOKEN.source).test(text)

function normalizeUrl(value: string) {
  const url = value.trim()
  if (!url) return ''
  const full = /^https?:\/\//i.test(url) ? url : `https://${url}`
  try {
    const parsed = new URL(full)
    return /^https?:$/.test(parsed.protocol) && parsed.hostname.includes('.')
      ? full.replace(
          /[()\s]/g,
          (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'),
        )
      : ''
  } catch {
    return ''
  }
}

/** Textarea where a selected word can get a link; shows the result. */
export function LinkTextarea({
  value,
  onChange,
  rows = 5,
  maxLength = 10000,
  placeholder,
  label,
}: {
  value: string
  onChange: (value: string) => void
  rows?: number
  maxLength?: number
  placeholder?: string
  label: string
}) {
  const area = useRef<HTMLTextAreaElement>(null)
  const [range, setRange] = useState<[number, number] | null>(null)
  const [url, setUrl] = useState('')
  const [hint, setHint] = useState('')

  function openLink() {
    const el = area.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const word = value.slice(start, end)
    if (!word.trim()) {
      setHint('Выделите в тексте слово, к которому нужна ссылка.')
      el.focus()
      return
    }
    if (/[[\]\n]/.test(word)) {
      setHint('Выделите слово или фразу в одной строке, без скобок.')
      return
    }
    setHint('')
    setUrl('')
    setRange([start, end])
  }

  function addLink() {
    if (!range) return
    const href = normalizeUrl(url)
    if (!href) {
      setHint('Укажите адрес страницы, например https://example.com')
      return
    }
    const [start, end] = range
    const next = `${value.slice(0, start)}[${value.slice(start, end)}](${href})${value.slice(end)}`
    if (next.length > maxLength) {
      setHint('Текст получится слишком длинным.')
      return
    }
    onChange(next)
    setRange(null)
    setHint('')
  }

  return (
    <div className="rich-input">
      <div className="rich-input__bar">
        <span>{label}</span>
        <button
          type="button"
          className="button-secondary button-small"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openLink}
        >
          <Link2 size={16} aria-hidden="true" /> Ссылка на слово
        </button>
      </div>
      <textarea
        ref={area}
        aria-label={label}
        rows={rows}
        maxLength={maxLength}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {range && (
        <div className="rich-input__link">
          <span className="caption">
            Ссылка для «{value.slice(range[0], range[1])}»
          </span>
          <input
            autoFocus
            type="url"
            inputMode="url"
            value={url}
            placeholder="https://…"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addLink()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setRange(null)
              }
            }}
          />
          <div className="rich-input__actions">
            <button
              type="button"
              className="button-primary button-small"
              onClick={addLink}
            >
              Добавить ссылку
            </button>
            <button
              type="button"
              className="button-secondary button-small"
              onClick={() => setRange(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
      {hint && <small className="error">{hint}</small>}
      {hasLinks(value) && (
        <div className="rich-input__preview">
          <span className="caption">Так увидит ученик:</span>
          <p>
            <RichText text={value} />
          </p>
        </div>
      )}
    </div>
  )
}
