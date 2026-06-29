/**
 * ISO 4217 supported currencies with symbol and exponent (minor unit decimal places).
 * exponent: USD/TWD = 2 (cents), JPY = 0 (no subdivision).
 */
const CURRENCIES: Record<string, { symbol: string; exponent: number }> = {
  USD: { symbol: '$', exponent: 2 },
  JPY: { symbol: '¥', exponent: 0 },
  TWD: { symbol: 'NT$', exponent: 2 },
}

export function isValidCurrency(code: string): boolean {
  return code.toUpperCase() in CURRENCIES
}

export function getExponent(code: string): number {
  const currency = CURRENCIES[code.toUpperCase()]
  if (!currency) throw new Error(`Unsupported currency: ${code}`)
  return currency.exponent
}

/**
 * amount 必為非負整數（最小單位）；float 或負值 throw，防止精度誤差流入。
 */
export function formatMoney(amount: number, code: string): string {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`Invalid amount: ${amount}. Must be a non-negative integer.`)
  }

  const currency = CURRENCIES[code.toUpperCase()]
  if (!currency) throw new Error(`Unsupported currency: ${code}`)

  const value = amount / Math.pow(10, currency.exponent)
  return `${currency.symbol}${value.toFixed(currency.exponent)}`
}
