import express, { Express } from 'express'
import healthRouter from './routes/health'

// createApp 不自動 listen，讓 supertest 可在測試中直接使用
export function createApp(): Express {
  const app = express()
  app.use(express.json())
  app.use(healthRouter)
  return app
}
