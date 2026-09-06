import { describe, expect, it } from 'vitest'
import { applyPhoneEdit } from './phoneInput'

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
