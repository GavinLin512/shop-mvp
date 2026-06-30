import express, { Express, NextFunction, Request, Response } from 'express'
import swaggerUi from 'swagger-ui-express'
import healthRouter from './routes/health'
import authRouter from './routes/auth'
import planRouter from './routes/plans'
import mockGatewayRouter from './routes/mockGateway'
import { createWebhookRouter } from './routes/webhooks'
import { createStripeWebhookRouter } from './routes/stripeWebhooks'
import type { StripeWebhooks } from './routes/stripeWebhooks'
import { createPaymentRouter } from './routes/payments'
import { createSubscriptionRouter } from './routes/subscriptions'
import { createDemoControlRouter } from './routes/demoControl'
import { MockProvider } from './providers/MockProvider'
import type { PaymentProvider } from './providers/PaymentProvider'
import { AppError } from './lib/errors'
import { openapiDocument } from './openapi/document'

type AppOptions = {
  /** 注入 PaymentProvider，預設使用 MockProvider（測試可傳 fake）。 */
  paymentProvider?: PaymentProvider
  /**
   * 注入 Stripe webhooks client（stripe.webhooks），用於掛載 /webhooks/stripe。
   * 提供時才掛載 Stripe webhook 路由；測試可傳 stub。
   */
  stripeWebhooks?: StripeWebhooks
}

// createApp 不自動 listen，讓 supertest 可在測試中直接使用
export function createApp(options: AppOptions = {}): Express {
  const app = express()
  const provider = options.paymentProvider ?? new MockProvider()

  // webhook 路由必須在 express.json() 前掛載，才能拿到 raw body 做驗簽（ADR-0002）
  app.use(createWebhookRouter(provider))

  // Stripe webhook 路由（同樣需 express.raw，掛在 express.json() 前）
  if (options.stripeWebhooks) {
    app.use(createStripeWebhookRouter(options.stripeWebhooks, provider))
  }

  app.use(express.json())

  // Swagger UI — 公開路由，不掛 requireAuth
  app.get('/api-docs/openapi.json', (_req, res) => {
    res.json(openapiDocument)
  })
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiDocument))

  // GET /config — 公開端點，回傳 demoMode 與 provider（不含任何密鑰）
  app.get('/config', (_req, res) => {
    res.json({
      demoMode: process.env.DEMO_MODE === 'true',
      provider: process.env.PAYMENT_PROVIDER === 'stripe' ? 'stripe' : 'mock',
    })
  })

  app.use(healthRouter)
  app.use(authRouter)
  app.use(planRouter)
  app.use(mockGatewayRouter)
  app.use(createPaymentRouter(provider))
  app.use(createSubscriptionRouter(provider))
  app.use(createDemoControlRouter(provider))

  // 全域錯誤處理：AppError → 對應狀態碼，其餘 → 500
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message })
      return
    }
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
