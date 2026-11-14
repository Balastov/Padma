import { useEffect, useRef, useState } from 'react'
import { ChevronDown, MessageCircle, Send } from 'lucide-react'
import { api, fullName } from '../api'
import type { Message, User } from '../api'
import { uploadAll } from '../files'
import { FileLinks, FilePicker, PendingFiles } from './Attachments'
import Avatar from './Avatar'
import { badgeText, unreadLabel, useChatUnread } from '../chatUnread'

export default function Messages({
  user,
  initialPeer = '',
  initialOpen = false,
}: {
  user: User
  /** Opened from a notification about this peer's message. */
  initialPeer?: string
  initialOpen?: boolean
}) {
  const chat = useChatUnread()
  const { refresh: refreshUnread, setActivePeer } = chat
  const [open, setOpen] = useState(initialOpen)
  const [peers, setPeers] = useState<User[]>([])
  const [selected, setSelected] = useState(initialPeer)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [attached, setAttached] = useState<File[]>([])
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
    let active = true,
      last = ''
    setActivePeer(peerId)
    const refresh = () =>
      api<Message[]>('/messages/' + peerId)
        .then((data) => {
          if (!active) return
          setMessages(data)
          setError('')
          // Reading the thread on the server clears its unread counter.
          const newest = data.at(-1)?.id || ''
          if (newest !== last) refreshUnread()
          last = newest
        })
        .catch((e) => {
          if (active) setError(e.message)
        })
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => {
      active = false
      clearInterval(timer)
      setActivePeer(null)
    }
  }, [open, peerId, available, refreshUnread, setActivePeer])

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight })
  }, [messages.length])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if ((!draft.trim() && !attached.length) || !peerId) return
    setBusy(true)
    try {
      const fileIds = await uploadAll(attached)
      await api('/messages/' + peerId, 'POST', { text: draft, fileIds })
      setDraft('')
      setAttached([])
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
        onClick={() => {
          // Open the conversation with new messages first.
          if (!open && !selected) {
            const waiting = peers.find((p) => chat.peers[p.id])
            if (waiting) setSelected(waiting.id)
          }
          setOpen(!open)
        }}
        aria-expanded={open}
      >
        <span className="messages__icon">
          <MessageCircle size={26} />
          {chat.total > 0 && (
            <span className="unread-badge unread-badge--corner">
              {badgeText(chat.total)}
              <span className="sr-only"> непрочитанных</span>
            </span>
          )}
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
                  setAttached([])
                }}
              >
                {peers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {fullName(p)}
                    {p.id === peerId ? '' : unreadLabel(chat.peers[p.id])}
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
                      {m.text && <p>{m.text}</p>}
                      <FileLinks files={m.files} />
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
              <PendingFiles
                files={attached}
                onChange={setAttached}
                disabled={busy}
              />
              <form className="messages__composer" onSubmit={send}>
                <FilePicker
                  compact
                  files={attached}
                  onChange={setAttached}
                  onError={setError}
                  disabled={busy}
                />
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
                  disabled={busy || (!draft.trim() && !attached.length)}
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
