import type { PaymentProvider } from './PaymentProvider'
import { MockProvider } from './MockProvider'
import { StripeProvider } from './StripeProvider'

export type ProviderName = 'mock' | 'stripe'

export interface ProviderRegistry {
  /** 回當下選用的 provider（新訂閱用）。 */
  current(): PaymentProvider
  /** 依名稱取指定 provider（cron 依 Subscription.provider 用）。 */
  get(name: ProviderName): PaymentProvider
  currentName(): ProviderName
  /** 切換當下 provider；呼叫端須先確認 isConfigured，未 configured 的 stripe 應在路由層擋 409。 */
  setCurrent(name: ProviderName): void
  isConfigured(name: ProviderName): boolean
}

export function createProviderRegistry(options: {
  mockProvider?: PaymentProvider
  stripeProvider?: PaymentProvider
} = {}): ProviderRegistry {
  const mock = options.mockProvider ?? new MockProvider()
  // StripeProvider 現在 lazy 建 client，缺金鑰不 crash
  const stripe = options.stripeProvider ?? new StripeProvider()

  // boot 初值從 env 讀；重啟即回預設（demo 設計，ADR-0013）
  let current: ProviderName =
    process.env.PAYMENT_PROVIDER === 'stripe' ? 'stripe' : 'mock'

  const providers: Record<ProviderName, PaymentProvider> = { mock, stripe }

  return {
    current() { return providers[current] },
    get(name) { return providers[name] },
    currentName() { return current },
    setCurrent(name) { current = name },
    isConfigured(name) {
      if (name === 'mock') return true
      return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
    },
  }
}

/**
 * 相容舊 paymentProvider 注入；以固定 provider 包裝成最小 ProviderRegistry。
 * 舊測試傳入 paymentProvider 時，registry 的所有操作都指向同一 provider，
 * 讓 createApp({ paymentProvider }) 呼叫端無需修改。
 */
export function createCompatRegistry(provider: PaymentProvider): ProviderRegistry {
  const name = (provider.name as ProviderName | undefined) ?? 'mock'
  return {
    current() { return provider },
    get(_n) { return provider },
    currentName() { return name },
    setCurrent(_n) { /* no-op：compat 模式不允許切換 */ },
    isConfigured(n) {
      if (n === 'mock') return true
      return name === 'stripe'
    },
  }
}
