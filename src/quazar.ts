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
    'В Padma уже есть аккаунт с этим номером. Войдите паролем и привяжите Квазар в профиле.',
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

let providers: Promise<boolean> | null = null
/** Whether the server has sign-in through Quazar configured. */
export function useQuazarEnabled() {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let alive = true
    providers ??= api<{ quazar: boolean }>('/auth/providers').then(
      (result) => result.quazar,
      () => {
        providers = null
        return false
      },
    )
    void providers.then((value) => {
      if (alive) setEnabled(value)
    })
    return () => {
      alive = false
    }
  }, [])
  return enabled
}
