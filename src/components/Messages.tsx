import { useEffect, useRef, useState } from 'react'
import { ChevronDown, MessageCircle, Send } from 'lucide-react'
import { api, fullName } from '../api'
import type { Message, User } from '../api'
import Avatar from './Avatar'

export default function Messages({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const [peers, setPeers] = useState<User[]>([])
  const [selected, setSelected] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingPeers, setLoadingPeers] = useState(true)
  const thread = useRef<HTMLDivElement>(null)
  const peerId =
    selected && peers.some((p) => p.id === selected)
      ? selected
      : peers[0]?.id || ''
  const peer = peers.find((p) => p.id === peerId) || null
  const available = Boolean(peerId)

  useEffect(() => {
    let active = true
    setLoadingPeers(true)
    api<User[]>('/chat-peers')
      .then((list) => {
        if (!active) return
        setPeers(list)
        setError('')
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setLoadingPeers(false)
      })
    return () => {
      active = false
    }
  }, [user.id])

  useEffect(() => {
    if (!open || !peerId || !available) return
    let active = true
    const refresh = () =>
      api<Message[]>('/messages/' + peerId)
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
  }, [open, peerId, available])

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight })
  }, [messages.length])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim() || !peerId) return
    setBusy(true)
    try {
      await api('/messages/' + peerId, 'POST', { text: draft })
      setDraft('')
      setMessages(await api<Message[]>('/messages/' + peerId))
      setError('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`messages glass-panel${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="messages__toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="messages__icon">
          <MessageCircle size={26} />
        </span>
        <span>
          <strong>{peer ? `Чат · ${fullName(peer)}` : 'Чат'}</strong>
          <small>
            {loadingPeers
              ? 'Загружаем контакты…'
              : available
                ? 'Будьте на связи между уроками'
                : 'Пока нет доступных собеседников'}
          </small>
        </span>
        <ChevronDown className={open ? 'rotate' : ''} size={20} />
      </button>
      {open && (
        <div className="messages__body">
          {peers.length > 0 && (
            <label className="field">
              <span>Пользователь</span>
              <select
                value={peerId}
                onChange={(e) => {
                  setSelected(e.target.value)
                  setMessages([])
                  setError('')
                  setDraft('')
                }}
              >
                {peers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {fullName(p)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!available ? (
            <p className="empty-state">
              {loadingPeers
                ? 'Загружаем список…'
                : 'Нет пользователей для переписки по вашим правам.'}
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
                    <Avatar user={peer} />
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
                  type="submit"
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
