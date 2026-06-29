import 'dotenv/config'
import cron from 'node-cron'
import { createApp } from './app'
import { runBillingCycle } from './jobs/billingCron'
import { MockProvider } from './providers/MockProvider'

const port = Number(process.env.PORT) || 3000
const provider = new MockProvider()

createApp().listen(port, () => {
  console.log(`Server listening on port ${port}`)
})

// 每小時頂點掃 nextBillingDate <= now 的訂閱續扣（DECISION.md #7）
cron.schedule('0 * * * *', async () => {
  const { processed, skipped } = await runBillingCycle(new Date(), provider)
  console.log(`[billing-cron] processed=${processed} skipped=${skipped}`)
}, { noOverlap: true, name: 'billing-cron', timezone: 'UTC' })
