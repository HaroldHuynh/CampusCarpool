import { useState } from 'react'

/**
 * Password input with the usual show/hide control. The button is inside the
 * field and is skipped by tab order, so it never sits between the password and
 * the submit button.
 */
function PasswordField({
  id,
  value,
  autoComplete,
  onChange,
}: {
  id: string
  value: string
  autoComplete: 'new-password' | 'current-password'
  onChange: (next: string) => void
}) {
  const [shown, setShown] = useState(false)

  return (
    <span className="password-field">
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="password-toggle"
        tabIndex={-1}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        onClick={() => setShown(!shown)}
      >
        {shown ? (
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 3l18 18M10.6 10.7a2 2 0 002.8 2.8M9.4 5.2A9.7 9.7 0 0112 5c5 0 9 4.5 9 7 0 1-.7 2.3-1.9 3.5M6.3 6.9C4 8.4 3 10.4 3 12c0 2.5 4 7 9 7 1.4 0 2.7-.3 3.8-.9"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 12s3.6-7 9-7 9 7 9 7-3.6 7-9 7-9-7-9-7Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        )}
      </button>
    </span>
  )
}

export default PasswordField
