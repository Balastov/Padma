import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import { api, fullName } from '../api'
import type { Message, User } from '../api'
import Avatar from './Avatar'
import './ChatDrawer.css'

export default function ChatDrawer({
  user,
  open,
  onClose,
}: {
  user: User
  open: boolean
  onClose: () => void
}) {
  const [peers, setPeers] = useState<User[]>([])
  const [selected, setSelected] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const thread = useRef<HTMLDivElement>(null)
  const peerId =
    selected && peers.some((p) => p.id === selected)
      ? selected
      : peers[0]?.id || ''
  const peer = peers.find((p) => p.id === peerId) || null

  useEffect(() => {
    if (!open) return
    let active = true
    api<User[]>('/chat-peers')
      .then((list) => {
        if (active) {
          setPeers(list)
          setError('')
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [open, user.id])

  useEffect(() => {
    if (!open || !peerId) return
    let active = true
    const refresh = () =>
      api<Message[]>('/messages/' + peerId)
        .then((data) => {
          if (active) setMessages(data)
        })
        .catch(() => {})
    refresh()
    const t = setInterval(refresh, 5000)
    return () => {
      active = false
      clearInterval(t)
    }
  }, [open, peerId])

  useEffect(() => {
    thread.current?.scrollTo(0, thread.current.scrollHeight)
  }, [messages.length, open])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!peerId || !draft.trim()) return
    setBusy(true)
    try {
      await api('/messages/' + peerId, 'POST', { text: draft.trim() })
      setDraft('')
      setMessages(await api<Message[]>('/messages/' + peerId))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null
  return (
    <div className="chat-drawer-backdrop" onClick={onClose}>
      <aside
        className="chat-drawer glass-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Чат"
      >
        <header className="chat-drawer__head">
          <div>
            <strong>
              <MessageCircle size={18} /> Чат
              {peer ? ` · ${fullName(peer)}` : ''}
            </strong>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </header>
        {peers.length > 0 && (
          <label className="field">
            <span>Собеседник</span>
            <select
              value={peerId}
              onChange={(e) => {
                setSelected(e.target.value)
                setMessages([])
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
        {!peerId ? (
          <p className="empty-state">Нет доступных собеседников.</p>
        ) : (
          <>
            <div className="chat-drawer__thread" ref={thread}>
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`message${m.senderId === user.id ? ' message--own' : ''}`}
                >
                  <p>{m.text}</p>
                </div>
              ))}
              {!messages.length && (
                <div className="empty-state">
                  <Avatar user={peer} />
                  <p>Начните разговор об уроке.</p>
                </div>
              )}
            </div>
            <form className="chat-drawer__composer" onSubmit={send}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Написать сообщение…"
                maxLength={2000}
              />
              <button
                type="submit"
                className="button-primary icon-button"
                disabled={busy || !draft.trim()}
                aria-label="Отправить"
              >
                <Send size={18} />
              </button>
            </form>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </aside>
    </div>
  )
}
