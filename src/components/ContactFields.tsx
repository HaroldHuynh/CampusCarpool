import PhoneField from './PhoneField'
import type { ContactMethod } from '../auth/auth'

type Props = {
  idPrefix: string
  method: ContactMethod
  value: string
  onMethodChange: (method: ContactMethod) => void
  onValueChange: (value: string) => void
}

/** Contact details are shared both ways — riders and drivers each need to
 *  reach the other — so the copy here stays neutral about which you are. */
function ContactFields({ idPrefix, method, value, onMethodChange, onValueChange }: Props) {
  return (
    <fieldset className="contact-fieldset">
      <legend>Contact info</legend>
      <p className="hint">Shared with the other person once a seat is confirmed.</p>

      <div className="segmented" role="radiogroup" aria-label="Contact method">
        {(['phone', 'instagram'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={method === option}
            className={`segment${method === option ? ' is-active' : ''}`}
            onClick={() => {
              onMethodChange(option)
              onValueChange('')
            }}
          >
            {option === 'phone' ? 'Phone number' : 'Instagram'}
          </button>
        ))}
      </div>

      <label className="sr-only" htmlFor={`${idPrefix}Contact`}>
        {method === 'phone' ? 'Phone number' : 'Instagram handle'}
      </label>

      {method === 'phone' ? (
        <PhoneField id={`${idPrefix}Contact`} value={value} onChange={onValueChange} />
      ) : (
        <input
          id={`${idPrefix}Contact`}
          type="text"
          value={value}
          autoComplete="off"
          placeholder="@mustangsally"
          onChange={(event) => onValueChange(event.target.value)}
        />
      )}
    </fieldset>
  )
}

export default ContactFields
