import { useRef, useState } from 'react'
import {
  BookOpen,
  CalendarDays,
  Check,
  CloudUpload,
  FileText,
  Headphones,
  PlayCircle,
} from 'lucide-react'
import './Homework.css'

type Task = {
  id: number
  title: string
  description: string
  icon: 'video' | 'grammar' | 'vocab' | 'listening' | 'reading'
}

const TASKS: Task[] = [
  {
    id: 1,
    title: 'Видеообъяснение',
    description: 'Посмотри видео и сделай короткие заметки',
    icon: 'video',
  },
  {
    id: 2,
    title: 'Грамматика',
    description: 'Упражнения на Past Simple и Present Perfect',
    icon: 'grammar',
  },
  {
    id: 3,
    title: 'Набор лексики',
    description: 'Изучи новые слова и выполни задания',
    icon: 'vocab',
  },
  {
    id: 4,
    title: 'Аудирование',
    description: 'Прослушай диалог и ответь на вопросы',
    icon: 'listening',
  },
  {
    id: 5,
    title: 'Чтение',
    description: 'Прочитай текст и выполни задания',
    icon: 'reading',
  },
]

const ICONS = {
  video: PlayCircle,
  grammar: FileText,
  vocab: BookOpen,
  listening: Headphones,
  reading: FileText,
}

export default function Homework() {
  const [done, setDone] = useState<number[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function toggleTask(id: number) {
    setDone((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function onFileChange(file?: File) {
    if (!file) return
    setFileName(file.name)
  }

  return (
    <section className="hw glass">
      <div className="hw__head">
        <div className="hw__title">
          <CalendarDays size={18} strokeWidth={1.9} className="hw__title-icon" />
          <h2>Домашнее задание</h2>
        </div>
        <p className="hw__deadline">
          <CalendarDays size={14} strokeWidth={2} />
          Сдать до 16 мая
        </p>
      </div>

      <ul className="hw__list">
        {TASKS.map((task, index) => {
          const Icon = ICONS[task.icon]
          const isDone = done.includes(task.id)
          return (
            <li key={task.id}>
              <button
                type="button"
                className={`hw__row${isDone ? ' is-done' : ''}`}
                onClick={() => toggleTask(task.id)}
              >
                <span className="hw__num">{index + 1}</span>
                <span className="hw__icon">
                  <Icon size={18} strokeWidth={1.8} />
                </span>
                <span className="hw__copy">
                  <strong>{task.title}</strong>
                  <span>{task.description}</span>
                </span>
                <span className={`hw__check${isDone ? ' is-on' : ''}`} aria-hidden>
                  {isDone && <Check size={14} strokeWidth={2.5} />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="hw__footer">
        <button
          type="button"
          className="hw__upload"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            onFileChange(e.dataTransfer.files?.[0])
          }}
        >
          <CloudUpload size={22} strokeWidth={1.7} />
          <span>
            <strong>{fileName ?? 'Прикрепить выполненное задание'}</strong>
            <small>PDF, DOC, DOCX, JPG, PNG · до 10MB</small>
          </span>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            onChange={(e) => onFileChange(e.target.files?.[0])}
          />
        </button>

        <button type="button" className="btn-cta hw__submit">
          Отправить на проверку
        </button>
      </div>
    </section>
  )
}
