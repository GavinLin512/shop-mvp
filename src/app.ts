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
import { createProviderRegistry, createCompatRegistry } from './providers/ProviderRegistry'
import type { ProviderRegistry } from './providers/ProviderRegistry'
import { AppError } from './lib/errors'
import { openapiDocument } from './openapi/document'

type AppOptions = {
  /**
   * 注入 ProviderRegistry（新方式）。
   * 優先於 paymentProvider；測試可傳入自建 registry。
   */
  registry?: ProviderRegistry
  /**
   * 相容舊測試：注入單一 PaymentProvider，自動包裝成 CompatRegistry。
   * 新程式碼請改用 registry。
   */
  paymentProvider?: PaymentProvider
  /**
   * 注入 Stripe webhooks client（stripe.webhooks），掛載 /webhooks/stripe。
   * configured（env 有金鑰）時應一律傳入，與當下 current provider 無關（ADR-0013）。
   */
  stripeWebhooks?: StripeWebhooks
}

// createApp 不自動 listen，讓 supertest 可在測試中直接使用
export function createApp(options: AppOptions = {}): Express {
  const app = express()

  // 組裝 registry：優先用注入的 registry，否則由 paymentProvider 相容包裝，最後 fallback mock
  const registry: ProviderRegistry =
    options.registry ??
    (options.paymentProvider
      ? createCompatRegistry(options.paymentProvider)
      : createProviderRegistry({ mockProvider: new MockProvider() }))

  // webhook 路由必須在 express.json() 前掛載，才能拿到 raw body 做驗簽（ADR-0002）
  app.use(createWebhookRouter(registry.current()))

  // Stripe webhook：只要提供 stripeWebhooks 即掛載（configured 才傳入），與當下 selector 無關（ADR-0013）
  if (options.stripeWebhooks) {
    app.use(createStripeWebhookRouter(options.stripeWebhooks, registry.get('stripe')))
  }

  app.use(express.json())

  // Swagger UI — 公開路由，不掛 requireAuth
  app.get('/api-docs/openapi.json', (_req, res) => {
    res.json(openapiDocument)
  })
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiDocument))

  // GET /config — 公開端點，回傳 demoMode / provider / stripeConfigured / publishableKey（ADR-0013）
  app.get('/config', (_req, res) => {
    const stripeConfigured = registry.isConfigured('stripe')
    const payload: Record<string, unknown> = {
      demoMode: process.env.DEMO_MODE === 'true',
      provider: registry.currentName(),
      stripeConfigured,
    }
    if (stripeConfigured && process.env.STRIPE_PUBLISHABLE_KEY) {
      payload.publishableKey = process.env.STRIPE_PUBLISHABLE_KEY
    }
    res.json(payload)
  })

  app.use(healthRouter)
  app.use(authRouter)
  app.use(planRouter)
  app.use(mockGatewayRouter)
  app.use(createPaymentRouter(registry.current()))
  app.use(createSubscriptionRouter(registry))
  app.use(createDemoControlRouter(registry))

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
