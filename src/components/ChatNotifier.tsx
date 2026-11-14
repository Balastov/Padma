import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MessageCircle, X } from 'lucide-react'
import { api } from '../api'
import { ChatUnreadContext, EMPTY_UNREAD } from '../chatUnread'
import type { ChatTarget, UnreadLatest, UnreadSummary } from '../chatUnread'
import './ChatNotifier.css'

const POLL_MS = 10000
const TOAST_MS = 9000

/**
 * Polls unread messages for the signed-in user: badges, the PWA icon
 * badge, the tab title and an in-app notification for a new message.
 */
export default function ChatNotifier({
  chatHome,
  children,
}: {
  /** Page with the chat panel; the student drawer opens anywhere. */
  chatHome?: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const [unread, setUnread] = useState<UnreadSummary>(EMPTY_UNREAD)
  const [toast, setToast] = useState<UnreadLatest | null>(null)
  // A tapped push notification opens the app with ?chat=<sender id>.
  const [target, setTarget] = useState<ChatTarget | null>(() => {
    const peerId = new URLSearchParams(search).get('chat')
    return peerId ? { peerId, at: 1 } : null
  })
  // Newest unread id already known; undefined until the first answer.
  const seen = useRef<string | null | undefined>(undefined)
  const active = useRef<string | null>(null)
  const apply = useCallback((next: UnreadSummary) => {
    setUnread(next)
    const latest = next.latest
    if (seen.current !== undefined && latest && latest.id !== seen.current) {
      const watching =
        document.visibilityState === 'visible' &&
        active.current === latest.peerId
      if (!watching) setToast(latest)
    }
    seen.current = latest?.id ?? null
  }, [])
  const refresh = useCallback(() => {
    api<UnreadSummary>('/messages/unread')
      .then(apply)
      .catch(() => {})
  }, [apply])

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible')
        api<UnreadSummary>('/messages/unread')
          .then(apply)
          .catch(() => {})
    }
    tick()
    const timer = setInterval(tick, POLL_MS)
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'padma-push') tick()
    }
    document.addEventListener('visibilitychange', tick)
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    }
  }, [apply])

  // PWA icon badge and «(3) Padma» in the browser tab.
  const baseTitle = useRef(document.title.replace(/^\(\d+\+?\) /, ''))
  useEffect(() => {
    const count = unread.total
    document.title = count
      ? `(${count > 99 ? '99+' : count}) ${baseTitle.current}`
      : baseTitle.current
    const nav = navigator as Navigator & {
      setAppBadge?: (n: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (count) nav.setAppBadge?.(count).catch(() => {})
    else nav.clearAppBadge?.().catch(() => {})
  }, [unread.total])
  useEffect(
    () => () => {
      document.title = baseTitle.current
    },
    [],
  )

  useEffect(() => {
    if (!new URLSearchParams(search).has('chat')) return
    const params = new URLSearchParams(search)
    params.delete('chat')
    const rest = params.toString()
    navigate(pathname + (rest ? '?' + rest : ''), { replace: true })
  }, [navigate, pathname, search])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const openChat = useCallback(
    (peerId = '') => {
      setToast(null)
      setTarget({ peerId, at: Date.now() })
      if (chatHome && pathname !== chatHome) navigate(chatHome)
    },
    [chatHome, navigate, pathname],
  )
  const closeChat = useCallback(() => setTarget(null), [])
  const setActivePeer = useCallback((peerId: string | null) => {
    active.current = peerId
  }, [])

  return (
    <ChatUnreadContext.Provider
      value={{
        ...unread,
        refresh,
        target,
        openChat,
        closeChat,
        setActivePeer,
      }}
    >
      {children}
      {toast && (
        <div className="chat-toast glass-panel" role="status">
          <span className="chat-toast__icon" aria-hidden="true">
            <MessageCircle size={20} />
          </span>
          <div className="chat-toast__body">
            <small>Новое сообщение</small>
            <strong>{toast.senderName}</strong>
            <p>{toast.text || 'Файл'}</p>
            <button
              type="button"
              className="button-primary button-small"
              onClick={() => openChat(toast.peerId)}
            >
              Открыть чат
            </button>
          </div>
          <button
            type="button"
            className="icon-button chat-toast__close"
            aria-label="Скрыть уведомление"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </ChatUnreadContext.Provider>
  )
}
