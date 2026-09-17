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

  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  const national = digits.slice(-10)
  return `+7${national}`
}

/** Format RU phone as +7 (9XX) XXX-XX-XX while typing. */
export function formatRuPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`
  if (digits.startsWith('7')) digits = digits.slice(1)
  if (digits.length > 0 && digits[0] !== '9') {
    const nine = digits.indexOf('9')
    digits = nine === -1 ? '' : digits.slice(nine)
  }
  digits = digits.slice(0, 10)

  let out = '+7'
  if (digits.length === 0) return out
  out += ` (${digits.slice(0, 3)}`
  if (digits.length < 3) return out
  out += ')'
  if (digits.length === 3) return out
  out += ` ${digits.slice(3, 6)}`
  if (digits.length <= 6) return out
  out += `-${digits.slice(6, 8)}`
  if (digits.length <= 8) return out
  out += `-${digits.slice(8, 10)}`
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
  return /^\+79\d{9}$/.test(normalizePhone(value, false))
}

export function isValidForeignPhone(value: string): boolean {
  const normalized = normalizePhone(value, true)
  return /^\+?\d{8,15}$/.test(normalized)
}

export function looksLikeForeignPhone(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (isCompleteRuPhone(trimmed)) return false
  const digits = trimmed.replace(/\D/g, '')
  if (
    (digits.length === 11 && digits.startsWith('79')) ||
    (digits.length === 10 && digits.startsWith('9')) ||
    /^\+7/.test(trimmed) ||
    /^8\d{10}$/.test(digits)
  )
    return false
  return Boolean(digits)
}
