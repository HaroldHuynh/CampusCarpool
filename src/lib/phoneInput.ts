import { formatPhoneInput } from '../auth/auth'

/** Index in `formatted` that sits just after the nth digit. */
export function caretAfterDigits(formatted: string, digitCount: number) {
  if (digitCount <= 0) {
    return 0
  }

  let seen = 0

  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) {
      seen += 1

      if (seen === digitCount) {
        return i + 1
      }
    }
  }

  return formatted.length
}

export type PhoneEdit = { value: string; caret: number }

/**
 * Reformats a phone field while keeping the caret against the same digit, so
 * typing and editing mid-string behave like an ordinary text input.
 *
 * Deleting a separator (the ")" in "(805) 555") would otherwise leave the
 * digits unchanged and the caret stuck, so a delete that removes no digit
 * removes the digit before the caret instead.
 */
export function applyPhoneEdit(rawValue: string, caret: number, previousValue: string): PhoneEdit {
  const digitsBeforeCaret = rawValue.slice(0, caret).replace(/\D/g, '').length
  const isDeletion = rawValue.length < previousValue.length
  const removedNoDigit =
    rawValue.replace(/\D/g, '').length === previousValue.replace(/\D/g, '').length

  let working = rawValue
  let targetDigits = digitsBeforeCaret

  if (isDeletion && removedNoDigit && digitsBeforeCaret > 0) {
    const digits = rawValue.replace(/\D/g, '')
    const kept = digits.slice(0, digitsBeforeCaret - 1) + digits.slice(digitsBeforeCaret)
    working = rawValue.trimStart().startsWith('+') ? `+${kept}` : kept
    targetDigits = digitsBeforeCaret - 1
  }

  const value = formatPhoneInput(working)

  return { value, caret: caretAfterDigits(value, targetDigits) }
}
