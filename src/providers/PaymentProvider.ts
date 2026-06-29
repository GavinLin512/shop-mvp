export type ChargeInput = {
  orderId: string
  amount: number
  currency: string
  idempotencyKey: string
}

export type ChargeResult = {
  providerTxnId: string
  status: 'PENDING'
}

/** 金流商介面 — service 只依賴此介面，換金流商只需新增實作（DECISION.md #8）。 */
export interface PaymentProvider {
  charge(input: ChargeInput): Promise<ChargeResult>
}
