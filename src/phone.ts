// Phone input. The server reads numbers as Quazar does and stores E.164;
// here only typing help and a first check.

/** E.164 candidate: without «+» the number is Russian. '' when empty. */
export function normalizePhone(value: string): string {
  let raw = value.trim()
  let digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('00')) {
    digits = digits.slice(2)
    raw = '+' + digits
  }
  if (raw.startsWith('+')) return '+' + digits
  if (digits.length === 11 && /^[78]/.test(digits))
    return '+7' + digits.slice(1)
  if (digits.length === 10) return '+7' + digits
  return '+' + digits
}

/** National digits of a Russian number being typed. */
function ruDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (raw.trim().startsWith('+')) digits = digits.slice(1)
  else if (/^[78]/.test(digits) && digits.length !== 10)
    digits = digits.slice(1)
  return digits.slice(0, 10)
}

/**
 * While typing: +7 (XXX) XXX-XX-XX for Russia and Kazakhstan, «+» and digits
 * for other countries. Erase down to «+» to type another country code.
 */
export function formatPhoneInput(raw: string): string {
  const trimmed = raw.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (trimmed.startsWith('+') && !digits) return '+'
  if (trimmed.startsWith('+') && !digits.startsWith('7'))
    return '+' + digits.slice(0, 15)
  const national = ruDigits(trimmed)
  let out = '+7'
  if (!national) return out
  out += ` (${national.slice(0, 3)}`
  if (national.length < 3) return out
  out += ')'
  if (national.length === 3) return out
  out += ` ${national.slice(3, 6)}`
  if (national.length <= 6) return out
  out += `-${national.slice(6, 8)}`
  if (national.length <= 8) return out
  return out + `-${national.slice(8, 10)}`
}

/** Typed far enough to send: the server makes the final check. */
export function isPhoneComplete(value: string): boolean {
  const phone = normalizePhone(value)
  return /^\+7\d{10}$/.test(phone) || /^\+[1-689]\d{7,14}$/.test(phone)
}

/** Anything typed beyond the «+7» prefix. */
export function phoneStarted(value: string): boolean {
  return value.replace(/\D/g, '').replace(/^7/, '').length > 0
}
