import 'dotenv/config'
import cron from 'node-cron'
import Stripe from 'stripe'
import { createApp } from './app'
import { runBillingCycle } from './jobs/billingCron'
import { runReconciliation } from './jobs/reconciliationCron'
import { MockProvider } from './providers/MockProvider'
import { StripeProvider } from './providers/StripeProvider'
import { createProviderRegistry } from './providers/ProviderRegistry'
import type { GatewayStatus } from './jobs/reconciliationCron'
import type { StripeWebhooks } from './routes/stripeWebhooks'

const port = Number(process.env.PORT) || 3000
const gatewayBaseUrl = process.env.MOCK_GATEWAY_URL ?? `http://localhost:${port}`

// 兩個 provider 常駐，boot 時不依 PAYMENT_PROVIDER 選其一（ADR-0013）。
// StripeProvider lazy 建真實 client，缺金鑰不 crash（boot safe）。
const registry = createProviderRegistry({
  mockProvider: new MockProvider(gatewayBaseUrl),
  stripeProvider: new StripeProvider(),
})

// Stripe webhook：只要金鑰齊全即掛載，與當下 current 無關（ADR-0013）。
const stripeWebhooksClient = registry.isConfigured('stripe')
  ? new Stripe(process.env.STRIPE_SECRET_KEY!).webhooks
  : undefined

createApp({
  registry,
  stripeWebhooks: stripeWebhooksClient as unknown as StripeWebhooks | undefined,
}).listen(port, () => {
  console.log(`Server listening on port ${port} [provider=${registry.currentName()}]`)
})

// 每小時頂點掃 nextBillingDate <= now 的訂閱續扣（DECISION.md #7）
cron.schedule('0 * * * *', async () => {
  const { processed, skipped } = await runBillingCycle(new Date(), registry)
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

  const { checked, updated } = await runReconciliation(new Date(), registry, queryGateway)
  console.log(`[reconciliation-cron] checked=${checked} updated=${updated}`)
}, { noOverlap: true, name: 'reconciliation-cron', timezone: 'UTC' })
