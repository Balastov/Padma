import { useState } from 'react'
import type { FormEvent } from 'react'
import { ChevronDown, MoreHorizontal, Paperclip, Send } from 'lucide-react'
import teacherImg from '../assets/teacher.jpg'
import studentImg from '../assets/student.jpg'
import './Chat.css'

type ChatProps = {
  open: boolean
  onToggle: () => void
}

type Message = {
  id: number
  from: 'teacher' | 'student'
  text: string
  time: string
}

const INITIAL: Message[] = [
  {
    id: 1,
    from: 'teacher',
    text: 'Аня, привет! Как прошло выполнение домашки по Past Simple?',
    time: '16:42',
  },
  {
    id: 2,
    from: 'student',
    text: 'Привет! Почти всё готово, осталось аудирование ✨',
    time: '16:48',
  },
  {
    id: 3,
    from: 'teacher',
    text: 'Отлично. Если что-то будет непонятно — пиши сюда.',
    time: '16:50',
  },
]

export default function Chat({ open, onToggle }: ChatProps) {
  const [messages, setMessages] = useState(INITIAL)
  const [draft, setDraft] = useState('')
  const unread = 1

  function send(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setMessages((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        from: 'student',
        text,
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      },
    ])
    setDraft('')
  }

  if (!open) {
    return (
      <button type="button" className="chat-bar glass" onClick={onToggle}>
        <img src={teacherImg} alt="" />
        <span className="chat-bar__copy">
          <strong>Чат с Милдой</strong>
          <small>
            <i />
            {unread} новое сообщение
          </small>
        </span>
        <ChevronDown size={18} />
      </button>
    )
  }

  return (
    <section className="chat glass">
      <div className="chat__head">
        <div className="chat__who">
          <img src={teacherImg} alt="" />
          <div>
            <h2>Чат с Милдой</h2>
            <p>обычно отвечает быстро</p>
          </div>
        </div>
        <div className="chat__actions">
          <button type="button" aria-label="Ещё" className="chat__icon-btn">
            <MoreHorizontal size={18} />
          </button>
          <button type="button" aria-label="Свернуть" className="chat__icon-btn" onClick={onToggle}>
            <ChevronDown size={18} />
          </button>
        </div>
      </div>

      <div className="chat__thread">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat__msg chat__msg--${msg.from}`}>
            {msg.from === 'teacher' && <img src={teacherImg} alt="" className="chat__avatar" />}
            <div className="chat__bubble">
              <p>{msg.text}</p>
              <time>{msg.time}</time>
            </div>
            {msg.from === 'student' && <img src={studentImg} alt="" className="chat__avatar" />}
          </div>
        ))}
      </div>

      <form className="chat__composer" onSubmit={send}>
        <button type="button" className="chat__attach" aria-label="Прикрепить файл">
          <Paperclip size={18} strokeWidth={1.8} />
        </button>
        <input
          type="text"
          placeholder="Написать сообщение..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="chat__send" aria-label="Отправить">
          <Send size={16} strokeWidth={2} />
        </button>
      </form>
    </section>
  )
}
