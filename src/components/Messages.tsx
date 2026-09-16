import { useEffect, useRef, useState } from 'react'
import { ChevronDown, MessageCircle, Send } from 'lucide-react'
import { api, fullName } from '../api'
import type { Message, Teacher, User } from '../api'
import Avatar from './Avatar'
export default function Messages({
  user,
  students,
  teacher,
}: {
  user: User
  students?: User[]
  teacher?: Teacher | null
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const studentId = students ? selected || students[0]?.id : user.id
  const available = students ? !!studentId : !!teacher
  const thread = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || !studentId || !available) return
    let active = true
    const refresh = () =>
      api<Message[]>('/messages/' + studentId)
        .then((data) => {
          if (active) {
            setMessages(data)
            setError('')
          }
        })
        .catch((e) => {
          if (active) setError(e.message)
        })
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [open, studentId, available])
  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight })
  }, [messages.length])
  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim() || !studentId) return
    setBusy(true)
    try {
      await api('/messages/' + studentId, 'POST', { text: draft })
      setDraft('')
      setMessages(await api<Message[]>('/messages/' + studentId))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className={`messages glass-panel${open ? ' is-open' : ''}`}>
      <button
        className="messages__toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="messages__icon">
          <MessageCircle size={26} />
        </span>
        <span>
          <strong>
            {students
              ? 'Чат с учениками'
              : teacher
                ? `Чат · ${teacher.name}`
                : 'Чат с учителем'}
          </strong>
          <small>
            {available
              ? 'Будьте на связи между уроками'
              : 'Появится после назначения учителя'}
          </small>
        </span>
        <ChevronDown className={open ? 'rotate' : ''} size={20} />
      </button>
      {open && (
        <div className="messages__body">
          {students && students.length > 0 && (
            <label className="field">
              <span>Ученик</span>
              <select
                value={studentId}
                onChange={(e) => {
                  setSelected(e.target.value)
                  setMessages([])
                  setError('')
                  setDraft('')
                }}
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fullName(s)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!available ? (
            <p className="empty-state">
              {students
                ? 'Добавьте ученика и назначьте ему учителя, чтобы начать общение.'
                : 'Скоро вам назначат учителя.'}
            </p>
          ) : (
            <>
              <div className="messages__thread" ref={thread} aria-live="polite">
                {messages.length ? (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`message${m.senderId === user.id ? ' message--own' : ''}`}
                    >
                      <p>{m.text}</p>
                      <time>
                        {new Date(m.created).toLocaleString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <Avatar user={teacher} />
                    <p>
                      Начните разговор.
                      <br />
                      Здесь можно задать вопрос об уроке.
                    </p>
                  </div>
                )}
              </div>
              <form className="messages__composer" onSubmit={send}>
                <input
                  aria-label="Сообщение"
                  placeholder="Написать сообщение…"
                  maxLength={2000}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button
                  className="button-primary icon-button"
                  disabled={busy || !draft.trim()}
                  aria-label="Отправить сообщение"
                >
                  <Send size={19} />
                </button>
              </form>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
