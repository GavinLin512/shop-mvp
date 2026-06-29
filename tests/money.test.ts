import { describe, it, expect } from 'vitest'
import { formatMoney, getExponent, isValidCurrency } from '../src/lib/money'

describe('money 純函式', () => {
  describe('formatMoney', () => {
    it('USD 兩位小數格式化 [tracer bullet]', () => {
      expect(formatMoney(999, 'USD')).toBe('$9.99')
    })

    it('JPY exponent 0，無小數', () => {
      expect(formatMoney(980, 'JPY')).toBe('¥980')
    })

    it('float amount → throw', () => {
      expect(() => formatMoney(9.99, 'USD')).toThrow()
    })

    it('負值 amount → throw', () => {
      expect(() => formatMoney(-100, 'USD')).toThrow()
    })

    it('不支援的 currency → throw', () => {
      expect(() => formatMoney(100, 'XXX')).toThrow()
    })

    it('currency 小寫照常運作（內部正規化大寫）', () => {
      expect(formatMoney(999, 'usd')).toBe('$9.99')
    })
  })

  describe('getExponent', () => {
    it('JPY exponent 為 0', () => {
      expect(getExponent('JPY')).toBe(0)
    })

    it('USD exponent 為 2', () => {
      expect(getExponent('USD')).toBe(2)
    })

    it('TWD exponent 為 2', () => {
      expect(getExponent('TWD')).toBe(2)
    })
  })

  describe('isValidCurrency', () => {
    it('USD → true', () => {
      expect(isValidCurrency('USD')).toBe(true)
    })

    it('小寫 usd → true（正規化大寫）', () => {
      expect(isValidCurrency('usd')).toBe(true)
    })

    it('兩碼 us → false', () => {
      expect(isValidCurrency('us')).toBe(false)
    })

    it('未支援的 XXX → false', () => {
      expect(isValidCurrency('XXX')).toBe(false)
    })
  })
})
