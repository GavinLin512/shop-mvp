import express, { Express, NextFunction, Request, Response } from 'express'
import healthRouter from './routes/health'
import authRouter from './routes/auth'
import planRouter from './routes/plans'
import mockGatewayRouter from './routes/mockGateway'
import { createPaymentRouter } from './routes/payments'
import { createSubscriptionRouter } from './routes/subscriptions'
import { MockProvider } from './providers/MockProvider'
import type { PaymentProvider } from './providers/PaymentProvider'
import { AppError } from './lib/errors'

type AppOptions = {
  /** 注入 PaymentProvider，預設使用 MockProvider（測試可傳 fake）。 */
  paymentProvider?: PaymentProvider
}

// createApp 不自動 listen，讓 supertest 可在測試中直接使用
export function createApp(options: AppOptions = {}): Express {
  const app = express()
  const provider = options.paymentProvider ?? new MockProvider()

  app.use(express.json())
  app.use(healthRouter)
  app.use(authRouter)
  app.use(planRouter)
  app.use(mockGatewayRouter)
  app.use(createPaymentRouter(provider))
  app.use(createSubscriptionRouter(provider))

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
