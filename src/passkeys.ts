import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { ApiError } from './api'

/** Passkeys work in a browser; the mobile app's WebView needs extra setup. */
export const passkeysSupported = () =>
  browserSupportsWebAuthn() && !/PadmaMobile/.test(navigator.userAgent)

/** Server messages are shown as they are; browser ones are in English. */
export function passkeyError(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError') return 'Действие с ключом доступа отменено'
  if (name === 'InvalidStateError') return 'Ключ этого устройства уже добавлен'
  return fallback
}
