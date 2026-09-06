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
  const isInternational = rawValue.trimStart().startsWith('+')

  // Autofill hands over the country code ("16692121088"); treat a leading 1 on
  // an 11-digit domestic number as NANP so it groups instead of being truncated.
  if (!isInternational) {
    const allDigits = rawValue.replace(/\D/g, '')

    if (allDigits.length === 11 && allDigits.startsWith('1')) {
      const value = formatPhoneInput(allDigits.slice(1))
      return { value, caret: value.length }
    }
  }

  const maxDigits = isInternational ? 15 : 10
  const limitedDigits = rawValue.replace(/\D/g, '').slice(0, maxDigits)
  const limitedRaw = rawValue.trimStart().startsWith('+') ? `+${limitedDigits}` : limitedDigits
  const digitsBeforeCaret = Math.min(rawValue.slice(0, caret).replace(/\D/g, '').length, maxDigits)
  const isDeletion = rawValue.length < previousValue.length
  const removedNoDigit =
    rawValue.replace(/\D/g, '').length === previousValue.replace(/\D/g, '').length

  let working = limitedRaw
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
