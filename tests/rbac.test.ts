import { describe, it, expect } from 'vitest'
import express, { Request, Response, NextFunction } from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { requireAuth, requireRole } from '../src/middlewares/auth'
import { AppError } from '../src/lib/errors'

// 建立一個只含測試用 route 的 mini app，不污染 production routes
function buildTestApp() {
  const app = express()
  app.use(express.json())

  // requireAuth 測試用 route：回傳 req.member.id 供斷言
  app.get('/test/me', requireAuth, (req: Request, res: Response) => {
    res.json({ memberId: req.member!.id })
  })

  // requireRole('ADMIN') 測試用 route
  app.get('/test/admin', requireAuth, requireRole('ADMIN'), (_req: Request, res: Response) => {
    res.json({ ok: true })
  })

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message })
      return
    }
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}

const app = buildTestApp()
const JWT_SECRET = process.env.JWT_SECRET!

// 製作已過期的 token：exp 設為過去時間
const expiredToken = jwt.sign(
  { sub: 'user-123', role: 'USER', exp: Math.floor(Date.now() / 1000) - 3600 },
  JWT_SECRET,
)

const userToken = jwt.sign({ sub: 'user-123', role: 'USER' }, JWT_SECRET)
const adminToken = jwt.sign({ sub: 'admin-456', role: 'ADMIN' }, JWT_SECRET)

describe('requireAuth + requireRole', () => {
  it('帶有效 USER token 通過 requireAuth，回傳 memberId [tracer bullet]', async () => {
    const res = await request(app)
      .get('/test/me')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(200)
    expect(res.body.memberId).toBe('user-123')
  })

  it('不帶 token → 401', async () => {
    const res = await request(app).get('/test/me')

    expect(res.status).toBe(401)
  })

  it('過期 token → 401', async () => {
    const res = await request(app)
      .get('/test/me')
      .set('Authorization', `Bearer ${expiredToken}`)

    expect(res.status).toBe(401)
  })

  it('竄改 token（簽章錯誤）→ 401', async () => {
    const tamperedToken = userToken.slice(0, -5) + 'XXXXX'
    const res = await request(app)
      .get('/test/me')
      .set('Authorization', `Bearer ${tamperedToken}`)

    expect(res.status).toBe(401)
  })

  it('USER token 存取 admin-only route → 403', async () => {
    const res = await request(app)
      .get('/test/admin')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(403)
  })

  it('ADMIN token 存取 admin-only route → 200', async () => {
    const res = await request(app)
      .get('/test/admin')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})
