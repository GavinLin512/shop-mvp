import 'dotenv/config'
import cron from 'node-cron'
import Stripe from 'stripe'
import { createApp } from './app'
import { runBillingCycle } from './jobs/billingCron'
import { runReconciliation } from './jobs/reconciliationCron'
import { MockProvider } from './providers/MockProvider'
import { StripeProvider } from './providers/StripeProvider'
import type { PaymentProvider } from './providers/PaymentProvider'
import type { GatewayStatus } from './jobs/reconciliationCron'

const port = Number(process.env.PORT) || 3000
const gatewayBaseUrl = process.env.MOCK_GATEWAY_URL ?? `http://localhost:${port}`

// 組裝點：PAYMENT_PROVIDER=stripe 時用 Stripe，否則用 Mock（DECISION.md #8, ADR-0011）
const paymentProviderName = process.env.PAYMENT_PROVIDER ?? 'mock'

let provider: PaymentProvider
let stripeInstance: Stripe | undefined

if (paymentProviderName === 'stripe') {
  stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!)
  provider = new StripeProvider(stripeInstance as unknown as import('./providers/StripeProvider').StripeClient)
} else {
  provider = new MockProvider(gatewayBaseUrl)
}

import type { StripeWebhooks } from './routes/stripeWebhooks'

createApp({
  paymentProvider: provider,
  stripeWebhooks: stripeInstance?.webhooks as unknown as StripeWebhooks | undefined,
}).listen(port, () => {
  console.log(`Server listening on port ${port} [provider=${paymentProviderName}]`)
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
