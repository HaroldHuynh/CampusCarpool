import { describe, expect, it } from 'vitest'
import { formatPrice } from './Shell'

describe('formatPrice', () => {
  it('omits cents for whole-dollar prices', () => expect(formatPrice(20)).toBe('20'))
  it('shows cents when present', () => expect(formatPrice(20.5)).toBe('20.50'))
})
