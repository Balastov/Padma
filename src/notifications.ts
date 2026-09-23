import { api } from './api'

const PROMPT_NEVER_KEY = 'padma-notify-never'
const PROMPT_SESSION_KEY = 'padma-notify-session-dismissed'

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function promptNeverAgain() {
  try {
    return localStorage.getItem(PROMPT_NEVER_KEY) === '1'
  } catch {
    return false
  }
}

export function setPromptNeverAgain() {
  try {
    localStorage.setItem(PROMPT_NEVER_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function promptSessionDismissed() {
  try {
    return sessionStorage.getItem(PROMPT_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export function setPromptSessionDismissed() {
  try {
    sessionStorage.setItem(PROMPT_SESSION_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function shouldShowNotifyPrompt(user: {
  notificationsEnabled?: boolean
}) {
  if (!pushSupported()) return false
  if (promptNeverAgain() || promptSessionDismissed()) return false
  if (Notification.permission === 'granted' && user.notificationsEnabled)
    return false
  return true
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

export async function registerPushWorker() {
  if (!pushSupported()) return null
  return navigator.serviceWorker.register('/sw.js')
}

export async function enablePushSubscription() {
  if (!pushSupported()) throw new Error('Уведомления не поддерживаются')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted')
    throw new Error('Разрешите уведомления в настройках браузера')
  const registration = await registerPushWorker()
  if (!registration) throw new Error('Не удалось зарегистрировать уведомления')
  await navigator.serviceWorker.ready
  const { publicKey } = await api<{ publicKey: string }>(
    '/push/vapid-public-key',
  )
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }
  const json = subscription.toJSON()
  await api('/push/subscribe', 'POST', {
    endpoint: json.endpoint,
    keys: json.keys,
  })
  return subscription
}

export async function disablePushSubscription() {
  if (!pushSupported()) return
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  try {
    await api('/push/subscribe', 'DELETE', { endpoint })
  } catch {
    /* ignore network */
  }
  await subscription.unsubscribe()
}

export async function syncPushWithPreference(enabled: boolean) {
  if (enabled) await enablePushSubscription()
  else await disablePushSubscription()
}
