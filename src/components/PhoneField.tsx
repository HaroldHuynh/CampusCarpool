import { useLayoutEffect, useRef } from 'react'
import { applyPhoneEdit } from '../lib/phoneInput'

type Props = {
  id: string
  value: string
  onChange: (next: string) => void
}

/**
 * Plain input holding the formatted string, the way react-number-format and
 * cleave.js do it. The only extra work is putting the caret back against the
 * same digit after a reformat.
 */
function PhoneField({ id, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingCaretRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const caret = pendingCaretRef.current

    if (caret !== null && inputRef.current) {
      inputRef.current.setSelectionRange(caret, caret)
      pendingCaretRef.current = null
    }
  })

  return (
    <input
      id={id}
      ref={inputRef}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={value}
      onChange={(event) => {
        const edit = applyPhoneEdit(
          event.target.value,
          event.target.selectionStart ?? event.target.value.length,
          value,
        )

        pendingCaretRef.current = edit.caret
        onChange(edit.value)
      }}
    />
  )
}

export default PhoneField
