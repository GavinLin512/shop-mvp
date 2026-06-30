import { describe, it, expect } from 'vitest'
import { formatCurrency } from '../lib/money'

describe('formatCurrency', () => {
  it('USD: 999 → $9.99 (exponent 2)', () => {
    expect(formatCurrency(999, 'USD')).toBe('$9.99')
  })

  it('JPY: 980 → ¥980 (exponent 0, no decimals)', () => {
    expect(formatCurrency(980, 'JPY')).toBe('¥980')
  })

  it('USD: 0 → $0.00', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00')
  })

  it('JPY: 0 → ¥0', () => {
    expect(formatCurrency(0, 'JPY')).toBe('¥0')
  })
})
