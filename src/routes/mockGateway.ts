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

// 模組層級 in-memory store（測試間用 resetStore() 清空）
const store = new Map<string, TxnRecord>()

export function resetStore(): void {
  store.clear()
}

function computeHmac(body: string): string {
  return crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET!)
    .update(body)
    .digest('hex')
}

/**
 * 成敗可控規則：amount % 100 === 1 → FAILED（測試失敗旗標），其餘 → SUCCESS。
 * 例：amount=1001 觸發失敗路徑，amount=1000 觸發成功路徑。
 */
function resolveOutcome(amount: number): 'SUCCESS' | 'FAILED' {
  return amount % 100 === 1 ? 'FAILED' : 'SUCCESS'
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
