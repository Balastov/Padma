import { useEffect, useState } from 'react'
import { api } from './api'

/** Texts for the `?quazar=` result of signing in or linking, see QUAZAR_SSO.md. */
export const quazarMessages: Record<string, string> = {
  linked: 'Квазар привязан. Теперь вход в Padma — только через Квазар.',
  denied: 'Вход через Квазар отменён.',
  unverified: 'Подтвердите телефон в Квазаре звонком и попробуйте снова.',
  expired: 'Попытка входа устарела. Начните заново.',
  failed: 'Квазар сейчас недоступен. Попробуйте позже.',
  phone_taken:
    'В Padma уже есть аккаунт с этим номером. Пока вход по паролю работает, войдите паролем и привяжите Квазар в профиле; иначе обратитесь к администратору.',
  archived: 'Этот аккаунт Padma закрыт. Обратитесь к администратору.',
  mismatch:
    'Номер в Квазаре не совпадает с номером в Padma. Укажите в профиле тот же номер, что в Квазаре, и повторите.',
  linked_other:
    'Этот аккаунт Квазара уже привязан к другому пользователю Padma.',
  already: 'К вашему аккаунту уже привязан другой аккаунт Квазара.',
}

/** Result code from the address after returning from Quazar. */
export const readQuazarResult = () => {
  const code = new URLSearchParams(window.location.search).get('quazar') || ''
  return code in quazarMessages ? code : ''
}

/** Removes `?quazar=` so a reload does not show the result again. */
export function clearQuazarResult() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('quazar')) return
  url.searchParams.delete('quazar')
  window.history.replaceState(window.history.state, '', url)
}

export type Providers = {
  quazar: boolean
  /** After this moment password sign-in ends (QUAZAR_SSO.md, 3.3). */
  passwordDeadline: string | null
  /** The deadline has come: no password sign-in (3.4). */
  passwordsClosed: boolean
}
const NONE: Providers = {
  quazar: false,
  passwordDeadline: null,
  passwordsClosed: false,
}
let providers: Promise<Providers> | null = null
/** Sign-in settings of the server, loaded once per page. */
export function useProviders() {
  const [value, setValue] = useState(NONE)
  useEffect(() => {
    let alive = true
    providers ??= api<Providers>('/auth/providers').catch(() => {
      providers = null
      return NONE
    })
    void providers.then((result) => {
      if (alive) setValue(result)
    })
    return () => {
      alive = false
    }
  }, [])
  return value
}
/** Whether the server has sign-in through Quazar configured. */
export const useQuazarEnabled = () => useProviders().quazar

export const formatDeadline = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  })
