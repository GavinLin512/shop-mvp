export type ChargeInput = {
  orderId: string
  amount: number
  currency: string
  idempotencyKey: string
}

export type ChargeResult = {
  providerTxnId: string
  /** PENDING = 等 webhook；SUCCESS / FAILED = off-session 同步出結果（Stripe 續扣） */
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  /** Stripe 首期建 PaymentIntent 時回傳，供前端 Elements confirm；Mock 不含此欄 */
  clientSecret?: string
}

/** 金流商介面 — service 只依賴此介面，換金流商只需新增實作（DECISION.md #8）。 */
export interface PaymentProvider {
  /** 用於 Payment.provider 欄位；未實作時退回 'mock'。 */
  readonly name?: string
  charge(input: ChargeInput): Promise<ChargeResult>
}
