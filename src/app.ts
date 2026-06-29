import express, { Express, NextFunction, Request, Response } from 'express'
import healthRouter from './routes/health'
import authRouter from './routes/auth'
import planRouter from './routes/plans'
import { AppError } from './lib/errors'

// createApp 不自動 listen，讓 supertest 可在測試中直接使用
export function createApp(): Express {
  const app = express()
  app.use(express.json())
  app.use(healthRouter)
  app.use(authRouter)
  app.use(planRouter)

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
