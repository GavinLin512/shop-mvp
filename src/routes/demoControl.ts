import express, { Router } from 'express'
import prisma from '../lib/prisma'
import { AppError } from '../lib/errors'
import { runBillingCycle } from '../jobs/billingCron'
import { requireDemoMode } from '../middlewares/demoMode'
import { requireAuth, requireRole } from '../middlewares/auth'
import { setForceFail, getForceFail, getLastWebhook } from './mockGateway'
import type { PaymentProvider } from '../providers/PaymentProvider'

export function createDemoControlRouter(provider: PaymentProvider): Router {
  const router: Router = Router()

  // 所有 demo-control 端點：requireDemoMode → requireAuth → requireRole('ADMIN')
  router.use('/demo', requireDemoMode, requireAuth, requireRole('ADMIN'))

  /**
   * POST /demo/reset
   * 清除所有 Subscription/Order/Payment + 非種子 Member/Plan，
   * 保留 isSeed=true 的列；並清空種子會員的 providerCustomerId。
   * 單一 tx，依 FK 順序刪除。
   */
  router.post('/demo/reset', async (_req, res) => {
    await prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany()
      await tx.order.deleteMany()
      await tx.subscription.deleteMany()
      await tx.member.deleteMany({ where: { isSeed: false } })
      await tx.plan.deleteMany({ where: { isSeed: false } })
      // 清掉種子會員的 Stripe customer 綁定（test mode 殘留可接受，ADR-0012）
      await tx.member.updateMany({
        where: { isSeed: true },
        data: { providerCustomerId: null },
      })
    })
    res.json({ ok: true })
  })

  /**
   * POST /demo/run-billing
   * 立即跑一次 billing cycle，回傳 { processed, skipped }。
   */
  router.post('/demo/run-billing', async (_req, res) => {
    const result = await runBillingCycle(new Date(), provider)
    res.json(result)
  })

  /**
   * POST /demo/subscriptions/:id/expire
   * 將指定訂閱的 nextBillingDate 撥為 now，讓 run-billing 可立即觸發（#7 <= now）。
   */
  router.post('/demo/subscriptions/:id/expire', async (req, res) => {
    const sub = await prisma.subscription.update({
      where: { id: req.params.id },
      data: { nextBillingDate: new Date() },
    })
    res.json(sub)
  })

  /**
   * GET /demo/mock/force-fail
   * 回目前 force-fail 旗標,讓前端 reload 後能還原開關狀態(避免 UI 與後端不同步)。
   * provider !== 'mock' → 409。
   */
  router.get('/demo/mock/force-fail', async (_req, res) => {
    if (provider.name !== 'mock') {
      throw new AppError(409, 'force-fail is only available for Mock provider')
    }
    res.json({ enabled: getForceFail() })
  })

  /**
   * POST /demo/mock/force-fail
   * body: { enabled: boolean }
   * 設 mock-gateway 的全域 force-fail 旗標。provider !== 'mock' → 409。
   */
  router.post('/demo/mock/force-fail', async (req, res) => {
    if (provider.name !== 'mock') {
      throw new AppError(409, 'force-fail is only available for Mock provider')
    }
    const { enabled } = req.body as { enabled: boolean }
    setForceFail(Boolean(enabled))
    res.json({ ok: true, forceFail: Boolean(enabled) })
  })

  /**
   * POST /demo/mock/replay-webhook
   * 將 mock-gateway 最後一筆 webhook 原樣重打 /webhooks/payment。
   * 回 { ok, duplicate }（冪等可觀測，ADR-0012）。
   * provider !== 'mock' 或無 last webhook → 409。
   */
  router.post('/demo/mock/replay-webhook', express.json(), async (req, res) => {
    if (provider.name !== 'mock') {
      throw new AppError(409, 'replay-webhook is only available for Mock provider')
    }
    const last = getLastWebhook()
    if (!last) {
      throw new AppError(409, 'No webhook to replay')
    }

    const webhookUrl = `http://localhost:${process.env.PORT ?? 3000}/webhooks/payment`
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': last.signature,
      },
      body: last.body,
    })

    const result = (await response.json()) as { ok: boolean; duplicate?: boolean }
    res.json({ ok: result.ok, duplicate: result.duplicate ?? false })
  })

  return router
}
