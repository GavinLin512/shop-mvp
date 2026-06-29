import 'dotenv/config'
import cron from 'node-cron'
import { createApp } from './app'
import { runBillingCycle } from './jobs/billingCron'
import { runReconciliation } from './jobs/reconciliationCron'
import { MockProvider } from './providers/MockProvider'
import type { GatewayStatus } from './jobs/reconciliationCron'

const port = Number(process.env.PORT) || 3000
const gatewayBaseUrl = process.env.MOCK_GATEWAY_URL ?? `http://localhost:${port}`
const provider = new MockProvider(gatewayBaseUrl)

createApp().listen(port, () => {
  console.log(`Server listening on port ${port}`)
})

// 每小時頂點掃 nextBillingDate <= now 的訂閱續扣（DECISION.md #7）
cron.schedule('0 * * * *', async () => {
  const { processed, skipped } = await runBillingCycle(new Date(), provider)
  console.log(`[billing-cron] processed=${processed} skipped=${skipped}`)
}, { noOverlap: true, name: 'billing-cron', timezone: 'UTC' })

// 每 5 分鐘掃逾時 PENDING Payment，主動查 gateway 補正（DECISION.md #3）
cron.schedule('*/5 * * * *', async () => {
  const queryGateway = async (txnId: string): Promise<GatewayStatus | null> => {
    try {
      const res = await fetch(`${gatewayBaseUrl}/mock-gateway/charge/${txnId}`)
      if (!res.ok) return null
      const data = await res.json() as { status: GatewayStatus }
      return data.status
    } catch {
      return null
    }
  }

  const { checked, updated } = await runReconciliation(new Date(), provider, queryGateway)
  console.log(`[reconciliation-cron] checked=${checked} updated=${updated}`)
}, { noOverlap: true, name: 'reconciliation-cron', timezone: 'UTC' })
