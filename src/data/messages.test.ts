import { describe, expect, it } from 'vitest'
import { MESSAGE_MAX_LENGTH, prepareMessageBody } from './messages'

describe('prepareMessageBody', () => {
  it('trims a message before it is sent', () => {
    expect(prepareMessageBody('  See you at the library!  ')).toBe('See you at the library!')
  })

  it('rejects an empty message', () => {
    expect(() => prepareMessageBody('   \n ')).toThrow('Write a message first.')
  })

  it('rejects a message over the server limit', () => {
    expect(() => prepareMessageBody('a'.repeat(MESSAGE_MAX_LENGTH + 1))).toThrow('up to 1000 characters')
  })
})
