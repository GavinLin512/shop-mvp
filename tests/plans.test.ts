import { describe, it, expect } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../src/lib/prisma'
import { createApp } from '../src/app'

const app = createApp()
const JWT_SECRET = process.env.JWT_SECRET!

const adminToken = jwt.sign({ sub: 'admin-1', role: 'ADMIN' }, JWT_SECRET)
const userToken = jwt.sign({ sub: 'user-1', role: 'USER' }, JWT_SECRET)

const validPlan = {
  name: 'Basic Plan',
  amount: 999,
  currency: 'USD',
  intervalDays: 30,
}

describe('04-plans', () => {
  describe('1. admin 建立方案回 201 [tracer bullet]', () => {
    it('ADMIN token POST /plans → 201，回傳 amount 與 currency', async () => {
      const res = await request(app)
        .post('/plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPlan)

      expect(res.status).toBe(201)
      expect(res.body.amount).toBe(999)
      expect(res.body.currency).toBe('USD')
    })
  })

  describe('2. GET /plans 列出 active 方案', () => {
    it('只回 active 方案，inactive 不含（免登入）', async () => {
      // 建立一個 active 方案（透過 API）
      await request(app)
        .post('/plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPlan)

      // 直接插入一個 inactive 方案（API 不提供此操作）
      await prisma.plan.create({
        data: { name: 'Inactive Plan', amount: 1999, currency: 'TWD', intervalDays: 365, active: false },
      })

      const res = await request(app).get('/plans')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].name).toBe('Basic Plan')
    })
  })

  describe('3. 授權邊界', () => {
    it('USER token POST /plans → 403', async () => {
      const res = await request(app)
        .post('/plans')
        .set('Authorization', `Bearer ${userToken}`)
        .send(validPlan)

      expect(res.status).toBe(403)
    })

    it('未登入 POST /plans → 401', async () => {
      const res = await request(app).post('/plans').send(validPlan)

      expect(res.status).toBe(401)
    })
  })

  describe('4. 驗證邊界', () => {
    it('amount 為 0（非正整數）→ 400', async () => {
      const res = await request(app)
        .post('/plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validPlan, amount: 0 })

      expect(res.status).toBe(400)
    })

    it('amount 為負數 → 400', async () => {
      const res = await request(app)
        .post('/plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validPlan, amount: -1 })

      expect(res.status).toBe(400)
    })

    it('currency 不支援（走 isValidCurrency）→ 400', async () => {
      const res = await request(app)
        .post('/plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validPlan, currency: 'XXX' })

      expect(res.status).toBe(400)
    })

    it('缺 intervalDays → 400', async () => {
      const res = await request(app)
        .post('/plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'X', amount: 100, currency: 'USD' })

      expect(res.status).toBe(400)
    })
  })
})
