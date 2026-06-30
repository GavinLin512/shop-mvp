import { Router } from 'express'
import crypto from 'crypto'

type TxnRecord = {
  txnId: string
  orderId: string
  amount: number
  currency: string
  // 初始為 PENDING；callback 觸發後更新為最終狀態
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
}

type LastWebhook = {
  body: string
  signature: string
}

// 模組層級 in-memory store（測試間用 resetStore() 清空）
const store = new Map<string, TxnRecord>()

// demo-control：force-fail 全域旗標，ON 時所有扣款回 FAILED（ADR-0012）
let forceFail = false

// demo-control：最後一筆送出的 webhook（用於 replay）
let lastWebhook: LastWebhook | null = null

export function getForceFail(): boolean {
  return forceFail
}

export function setForceFail(enabled: boolean): void {
  forceFail = enabled
}

export function getLastWebhook(): LastWebhook | null {
  return lastWebhook
}

export function resetStore(): void {
  store.clear()
  forceFail = false
  lastWebhook = null
}

function computeHmac(body: string): string {
  return crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET!)
    .update(body)
    .digest('hex')
}

/**
 * 成敗規則：forceFail 為 true → FAILED；否則 SUCCESS。
 * 舊的 amount % 100 技巧已廢棄，改用全域開關（ADR-0012）。
 */
function resolveOutcome(_amount: number): 'SUCCESS' | 'FAILED' {
  return forceFail ? 'FAILED' : 'SUCCESS'
}

const router: Router = Router()

// POST /mock-gateway/charge
// body: { orderId, amount, currency, idempotencyKey, _callbackUrl? }
// 回 { txnId, status:"PENDING" }，之後非同步回打 webhook
router.post('/mock-gateway/charge', (req, res) => {
  const { orderId, amount, currency, idempotencyKey, _callbackUrl } = req.body

  const txnId = `txn_${crypto.randomUUID()}`
  const outcome = resolveOutcome(amount)

  store.set(txnId, { txnId, orderId, amount, currency, status: 'PENDING' })

  // callback URL 預設打 app 自身的 webhook 端點；測試用 _callbackUrl 覆蓋
  const callbackUrl =
    _callbackUrl ??
    `http://localhost:${process.env.PORT ?? 3000}/webhooks/payment`

  // 非同步回打：先回應 PENDING，再觸發 callback
  setImmediate(async () => {
    const body = JSON.stringify({ txnId, orderId, status: outcome, amount, currency })
    const signature = computeHmac(body)

    // 存下最後一筆 webhook（replay 用，ADR-0012）
    lastWebhook = { body, signature }

    try {
      await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': signature,
        },
        body,
      })
    } catch {
      // webhook 端點可能尚未實作，忽略連線錯誤
    }

    // 更新 store 最終狀態
    const txn = store.get(txnId)
    if (txn) txn.status = outcome
  })

  res.json({ txnId, status: 'PENDING' })
})

// GET /mock-gateway/charge/:txnId — 對帳查詢
router.get('/mock-gateway/charge/:txnId', (req, res) => {
  const txn = store.get(req.params.txnId)
  if (!txn) {
    res.status(404).json({ error: 'Transaction not found' })
    return
  }
  res.json(txn)
})

export default router
