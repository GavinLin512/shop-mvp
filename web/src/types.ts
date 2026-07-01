export interface Config {
  demoMode: boolean
  provider: 'mock' | 'stripe'
  stripeConfigured: boolean
  publishableKey?: string
}

/** POST /subscriptions 回應（ADR-0013）：Stripe 首扣有 clientSecret，Mock 無 */
export interface CreateSubscriptionResult {
  subscription: Subscription
  clientSecret?: string
}

export interface Plan {
  id: string
  name: string
  amount: number
  currency: string
  intervalDays: number
}

// 單筆訂閱（GET /subscriptions/:id、POST /subscriptions 回傳）
export interface Subscription {
  id: string
  status: 'INCOMPLETE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED'
  cancelAtPeriodEnd: boolean
  planId: string
  memberId?: string
  nextBillingDate?: string
}

// GET /subscriptions — 會員本人的訂閱清單，含 planName
export interface MemberSubscription {
  id: string
  status: 'INCOMPLETE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED'
  cancelAtPeriodEnd: boolean
  planId: string
  planName: string
  startedAt: string
  nextBillingDate?: string
  // 續扣可觀測性：已成功扣款次數與最後扣款時間
  billedCount: number
  lastBilledAt: string | null
}

// GET /admin/subscriptions — 後台全部訂閱，含 memberEmail / amount
export interface AdminSubscription {
  id: string
  memberId: string
  memberEmail: string
  planName: string
  amount: number
  currency: string
  status: 'INCOMPLETE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED'
  cancelAtPeriodEnd: boolean
  startedAt: string
  nextBillingDate?: string
  // 續扣可觀測性：已成功扣款次數與最後扣款時間
  billedCount: number
  lastBilledAt: string | null
}
