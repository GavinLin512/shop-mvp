import { describe, it, expect } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { createApp } from '../src/app'
import prisma from '../src/lib/prisma'

const app = createApp()

describe('POST /auth/register', () => {
  it('合法註冊回 201，body 含必要欄位且不含 passwordHash', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'password123' })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      email: 'alice@example.com',
      role: 'USER',
      tier: 'NORMAL',
    })
    expect(res.body).toHaveProperty('id')
    expect(res.body).toHaveProperty('createdAt')
    expect(res.body).not.toHaveProperty('passwordHash')
  })

  it('密碼有被雜湊，bcrypt.compare 為 true', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'bob@example.com', password: 'mypassword' })

    const member = await prisma.member.findUnique({ where: { email: 'bob@example.com' } })
    expect(member).not.toBeNull()
    expect(member!.passwordHash).not.toBe('mypassword')
    expect(await bcrypt.compare('mypassword', member!.passwordHash)).toBe(true)
  })

  it('重複 email 回 409，DB 只有一筆', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'dup@example.com', password: 'password123' })

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'dup@example.com', password: 'password456' })

    expect(res.status).toBe(409)

    const count = await prisma.member.count({ where: { email: 'dup@example.com' } })
    expect(count).toBe(1)
  })

  it('email 格式錯誤回 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'password123' })

    expect(res.status).toBe(400)

    const count = await prisma.member.count()
    expect(count).toBe(0)
  })

  it('password 太短回 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'short@example.com', password: 'abc' })

    expect(res.status).toBe(400)
  })
})
