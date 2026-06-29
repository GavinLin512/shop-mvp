import type { PaymentProvider } from '../providers/PaymentProvider'
import prisma from '../lib/prisma'

type ChargeOrderInput = {
  orderId: string
  amount: number
  currency: string
  idempotencyKey: string
}

/**
 * 工廠函式 — 注入 PaymentProvider，讓測試可替換 fake provider，
 * 驗證 service 不直接依賴任何金流商實作（adapter pattern）。
 */
export function createPaymentService(provider: PaymentProvider) {
  return {
    async chargeOrder(input: ChargeOrderInput) {
      // service 只依賴介面，不知道底層是 Mock / Stripe / Ecpay
      const { providerTxnId, status } = await provider.charge({
        orderId: input.orderId,
        amount: input.amount,
        currency: input.currency,
        idempotencyKey: input.idempotencyKey,
      })

      const payment = await prisma.payment.create({
        data: {
          orderId: input.orderId,
          amount: input.amount,
          currency: input.currency,
          provider: 'mock',
          providerTxnId,
          status: 'PENDING',
        },
      })

      return { payment, providerTxnId }
    },
  }
}
