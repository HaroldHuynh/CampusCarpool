import { describe, expect, it } from 'vitest'
import { applyPhoneEdit } from './phoneInput'
import { formatPhoneInput } from '../auth/auth'

describe('applyPhoneEdit', () => {
  it('limits domestic phone numbers to ten digits', () => {
    const edit = applyPhoneEdit('8055551234999', 13, '')
    expect(edit.value.replace(/\D/g, '')).toHaveLength(10)
  })

  it('limits international phone numbers to fifteen digits', () => {
    const edit = applyPhoneEdit('+123456789012345999', 19, '')
    expect(edit.value.replace(/\D/g, '')).toHaveLength(15)
  })
})

describe('formatPhoneInput', () => {
  it('groups a complete +1 number like a domestic one', () => {
    expect(formatPhoneInput('+18055550134')).toBe('(805) 555-0134')
  })

  it('leaves other international numbers ungrouped', () => {
    expect(formatPhoneInput('+448055550134')).toBe('+448055550134')
  })
})
