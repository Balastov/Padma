import { createContext, useContext } from 'react'

/** Newest unread message, shown as an in-app notification. */
export type UnreadLatest = {
  id: string
  peerId: string
  senderId: string
  senderName: string
  text: string
  created: string
}
export type UnreadSummary = {
  total: number
  /** Unread count per chat peer id. */
  peers: Record<string, number>
  latest: UnreadLatest | null
}
/** A request to open the chat, optionally with a given peer. */
export type ChatTarget = { peerId: string; at: number }
export type ChatUnread = UnreadSummary & {
  refresh: () => void
  target: ChatTarget | null
  openChat: (peerId?: string) => void
  closeChat: () => void
  /** The thread currently on screen: no in-app notification for it. */
  setActivePeer: (peerId: string | null) => void
}
export const EMPTY_UNREAD: UnreadSummary = { total: 0, peers: {}, latest: null }
const noop = () => {}
export const ChatUnreadContext = createContext<ChatUnread>({
  ...EMPTY_UNREAD,
  refresh: noop,
  target: null,
  openChat: noop,
  closeChat: noop,
  setActivePeer: noop,
})
export const useChatUnread = () => useContext(ChatUnreadContext)
/** «3 новых» for selects and labels. */
export const unreadLabel = (count?: number) =>
  count ? ` · ${count > 99 ? '99+' : count} нов.` : ''
export const badgeText = (count: number) => (count > 99 ? '99+' : String(count))
