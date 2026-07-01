import prisma from '../lib/prisma'
import type { ProviderRegistry, ProviderName } from '../providers/ProviderRegistry'
import { applyPaymentOutcome } from '../services/webhookService'

export type GatewayStatus = 'PENDING' | 'SUCCESS' | 'FAILED'

/**
 * 查詢 gateway 取單筆交易最終狀態的函式簽章。
 * 回傳 null 表示查詢失敗或找不到交易，此時該筆略過。
 */
export type GatewayQuery = (txnId: string) => Promise<GatewayStatus | null>

/**
 * 掃 PENDING Payment 超過門檻的筆數，逐一查 gateway 補正狀態。
 * 走 applyPaymentOutcome 共用冪等邏輯，與遲到的 webhook 不會重複更新（DECISION.md #3）。
 *
 * @param now           當前時間（可注入，方便測試）
 * @param registry      ProviderRegistry（供 dunning 重試依 Payment.provider 取對應實作）
 * @param queryGateway  查詢 gateway 函式（可注入，測試可替換 stub）
 * @param thresholdMinutes 超過幾分鐘的 PENDING 才處理（預設 5）
 * @returns checked     本次掃到的 PENDING 筆數
 * @returns updated     成功補正（非 PENDING）的筆數
 */
export async function runReconciliation(
  now: Date,
  registry: ProviderRegistry,
  queryGateway: GatewayQuery,
  thresholdMinutes = 5,
): Promise<{ checked: number; updated: number }> {
  const threshold = new Date(now.getTime() - thresholdMinutes * 60 * 1000)

  // 只撈有 providerTxnId 且超過門檻的 PENDING；已終態的不再重撈
  const pendingPayments = await prisma.payment.findMany({
    where: {
      status: 'PENDING',
      providerTxnId: { not: null },
      createdAt: { lte: threshold },
    },
    select: { providerTxnId: true, orderId: true, provider: true },
  })

  let checked = 0
  let updated = 0

  for (const payment of pendingPayments) {
    checked++
    try {
      const gatewayStatus = await queryGateway(payment.providerTxnId!)

      // gateway 查詢失敗或仍 PENDING → 略過，等下一輪
      if (!gatewayStatus || gatewayStatus === 'PENDING') continue

      // 依 Payment.provider 取對應實作，確保 dunning 重試走同一 provider（ADR-0013）
      const paymentProvider = registry.get(payment.provider as ProviderName)
      await applyPaymentOutcome(payment.providerTxnId!, payment.orderId, gatewayStatus, paymentProvider)
      updated++
    } catch (err) {
      // 逐筆隔離：單筆失敗不影響其餘（同 billingCron 設計）
      console.error(`[reconciliation] txnId=${payment.providerTxnId} failed:`, err)
    }
  }

  return { checked, updated }
}
