import { useRef, useState } from 'react'
import { FileText, Paperclip, X } from 'lucide-react'
import {
  ACCEPT,
  FILE_HINT,
  KEEP_DAYS,
  MAX_FILES,
  fileProblem,
  fileUrl,
  formatSize,
} from '../files'
import type { StoredFile } from '../files'
import './Attachments.css'

type PickerProps = {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
  /** Up to MAX_FILES by default. */
  max?: number
  /**
   * Icon-only button for compact composers such as the chat: the parent shows
   * the chosen files (PendingFiles) and the error (onError).
   */
  compact?: boolean
  onError?: (message: string) => void
  label?: string
}

/** Choose local files; they are uploaded when the form is sent. */
export function FilePicker({
  files,
  onChange,
  disabled,
  max = MAX_FILES,
  compact,
  onError,
  label = 'Прикрепить файл',
}: PickerProps) {
  const input = useRef<HTMLInputElement>(null)
  const [ownError, setOwnError] = useState('')
  const setError = (message: string) =>
    onError ? onError(message) : setOwnError(message)
  function add(list: FileList | null) {
    const chosen = Array.from(list || [])
    const problem = chosen.map(fileProblem).find(Boolean)
    if (problem) setError(problem)
    else if (files.length + chosen.length > max)
      setError(
        max === 1 ? 'Можно прикрепить один файл' : `Не больше ${max} файлов`,
      )
    else {
      setError('')
      onChange(max === 1 ? chosen : [...files, ...chosen])
    }
    if (input.current) input.current.value = ''
  }
  return (
    <div className={`attach${compact ? ' attach--compact' : ''}`}>
      <input
        ref={input}
        type="file"
        hidden
        multiple={max > 1}
        accept={ACCEPT}
        onChange={(e) => add(e.target.files)}
      />
      <button
        type="button"
        className={
          compact
            ? 'icon-button attach__button'
            : 'button-secondary attach__button'
        }
        disabled={disabled || files.length >= max}
        aria-label={label}
        title={label}
        onClick={() => input.current?.click()}
      >
        <Paperclip size={18} />
        {!compact && label}
      </button>
      {!compact && (
        <>
          <small className="caption">{FILE_HINT}</small>
          <PendingFiles files={files} onChange={onChange} disabled={disabled} />
        </>
      )}
      {ownError && (
        <p className="error attach__error" role="alert">
          {ownError}
        </p>
      )}
    </div>
  )
}

/** Chosen files waiting to be sent, each can be removed. */
export function PendingFiles({
  files,
  onChange,
  disabled,
}: Pick<PickerProps, 'files' | 'onChange' | 'disabled'>) {
  if (!files.length) return null
  return (
    <ul className="attach__chips">
      {files.map((file, i) => (
        <li key={file.name + i}>
          <FileText size={15} aria-hidden="true" />
          <span>{file.name}</span>
          <small>{formatSize(file.size)}</small>
          <button
            type="button"
            aria-label={`Убрать ${file.name}`}
            disabled={disabled}
            onClick={() => onChange(files.filter((_, j) => j !== i))}
          >
            <X size={14} />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Links to uploaded files; expired ones are shown as removed. */
export function FileLinks({ files }: { files?: StoredFile[] }) {
  if (!files?.length) return null
  return (
    <ul className="attach__links">
      {files.map((file) =>
        file.deleted ? (
          <li key={file.id} className="attach__expired">
            <FileText size={16} aria-hidden="true" />
            <span>
              {file.name} — удалён, файлы хранятся {KEEP_DAYS} дней
            </span>
          </li>
        ) : (
          <li key={file.id}>
            <a href={fileUrl(file)} target="_blank" rel="noreferrer">
              <FileText size={16} aria-hidden="true" />
              <span>{file.name}</span>
              <small>{formatSize(file.size)}</small>
            </a>
          </li>
        ),
      )}
    </ul>
  )
}
