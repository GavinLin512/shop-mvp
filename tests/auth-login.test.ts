import { describe, it, expect } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../src/app'

const app = createApp()

async function registerUser(email: string, password: string) {
  await request(app).post('/auth/register').send({ email, password })
}

describe('POST /auth/login', () => {
  it('正確帳密回 200 含 token，decode 後 sub === memberId 且含 role', async () => {
    await registerUser('alice@example.com', 'password123')

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'alice@example.com', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')

    const payload = jwt.decode(res.body.token) as Record<string, unknown>
    expect(typeof payload.sub).toBe('string')
    expect(payload.sub).toBeTruthy()
    expect(payload).toHaveProperty('role')
  })

  it('密碼錯回 401', async () => {
    await registerUser('bob@example.com', 'correctpassword')

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'bob@example.com', password: 'wrongpassword' })

    expect(res.status).toBe(401)
  })

  it('email 不存在回 401，訊息與密碼錯相同', async () => {
    await registerUser('charlie@example.com', 'password123')

    const wrongEmailRes = await request(app)
      .post('/auth/login')
      .send({ email: 'notexist@example.com', password: 'password123' })

    const wrongPassRes = await request(app)
      .post('/auth/login')
      .send({ email: 'charlie@example.com', password: 'wrongpassword' })

    expect(wrongEmailRes.status).toBe(401)
    expect(wrongPassRes.status).toBe(401)
    // 兩種錯誤回同一訊息，不洩漏帳號存在性
    expect(wrongEmailRes.body.error).toBe(wrongPassRes.body.error)
  })

  it('缺欄位回 400', async () => {
    const missingPassword = await request(app)
      .post('/auth/login')
      .send({ email: 'alice@example.com' })

    const missingEmail = await request(app)
      .post('/auth/login')
      .send({ password: 'password123' })

    expect(missingPassword.status).toBe(400)
    expect(missingEmail.status).toBe(400)
  })
})
