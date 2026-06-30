// DECISION #4: 金額一律存最小單位整數，依 ISO 4217 exponent 格式化顯示
// JPY / KRW / VND exponent = 0，其餘預設 2
const ZERO_EXPONENT_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'BIF', 'CLP', 'GNF', 'ISK', 'MGA', 'PYG', 'RWF', 'UGX', 'UYI', 'XAF', 'XOF', 'XPF'])

export function formatCurrency(amount: number, currency: string): string {
  const exponent = ZERO_EXPONENT_CURRENCIES.has(currency) ? 0 : 2
  const value = amount / Math.pow(10, exponent)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(value)
}
