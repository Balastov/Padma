/** Normalize phone for storage and login lookup. */
export function normalizePhone(value: string, foreign = false): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (foreign) {
    const hasPlus = trimmed.startsWith('+')
    const digits = trimmed.replace(/\D/g, '')
    if (!digits) return ''
    return hasPlus ? `+${digits}` : digits
  }

  let digits = trimmed.replace(/\D/g, '')
  if (digits.startsWith('8') && digits.length === 11) digits = `7${digits.slice(1)}`
  if (digits.length === 10) digits = `7${digits}`
  if (!digits.startsWith('7')) digits = `7${digits}`
  digits = digits.slice(0, 11)
  return digits.length === 11 ? `+${digits}` : `+${digits}`
}

/** Format RU phone as +7 (XXX) XXX-XX-XX while typing. */
export function formatRuPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`
  if (!digits.startsWith('7')) digits = `7${digits}`
  digits = digits.slice(0, 11)

  const rest = digits.slice(1)
  let out = '+7'
  if (rest.length === 0) return out
  out += ` (${rest.slice(0, 3)}`
  if (rest.length < 3) return out
  out += ')'
  if (rest.length === 3) return out
  out += ` ${rest.slice(3, 6)}`
  if (rest.length <= 6) return out
  out += `-${rest.slice(6, 8)}`
  if (rest.length <= 8) return out
  out += `-${rest.slice(8, 10)}`
  return out
}

/** Foreign phone: optional leading +, then digits only. */
export function formatForeignPhoneInput(raw: string): string {
  if (!raw) return ''
  const hasPlus = raw.trimStart().startsWith('+')
  const digits = raw.replace(/\D/g, '').slice(0, 15)
  return hasPlus ? `+${digits}` : digits
}

export function isCompleteRuPhone(value: string): boolean {
  return /^\+7\d{10}$/.test(normalizePhone(value, false))
}

export function isValidForeignPhone(value: string): boolean {
  const normalized = normalizePhone(value, true)
  return /^\+?\d{8,15}$/.test(normalized)
}
