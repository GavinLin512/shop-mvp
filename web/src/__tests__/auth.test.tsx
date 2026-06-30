import React from 'react'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { App } from '../App'

// 建立 base64url 格式的測試用 JWT（不驗簽，純供 payload 解析）
function makeToken(payload: object): string {
  const b64url = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.fakesig`
}

const USER_TOKEN = makeToken({ sub: 'u1', role: 'USER', exp: 9999999999 })
const ADMIN_TOKEN = makeToken({ sub: 'a1', role: 'ADMIN', exp: 9999999999 })

describe('Login + role routing', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('no token → shows login form', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.queryByText(/subscription plans/i)).not.toBeInTheDocument()
  })

  it('USER login → shows member view (PlanGrid)', async () => {
    const fetchMock = vi.fn()
    // GET /api/config (from ConfigProvider on mount)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ demoMode: false, provider: 'mock' }),
    })
    // POST /api/auth/login
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token: USER_TOKEN }),
    })
    // GET /api/plans (from PlanGrid) + subsequent calls
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@test.com' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      // h1 文字跨 text node 與 <span>，用 role + toHaveTextContent 查
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/subscription.*plans/i)
    })

    // token 寫入 sessionStorage
    expect(sessionStorage.getItem('token')).toBe(USER_TOKEN)
  })

  it('ADMIN login → shows admin view (CreatePlanForm)', async () => {
    const fetchMock = vi.fn()
    // GET /api/config (from ConfigProvider on mount)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ demoMode: false, provider: 'mock' }),
    })
    // POST /api/auth/login
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token: ADMIN_TOKEN }),
    })
    // subsequent calls (plans, subscriptions)
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'admin@test.com' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/admin.*panel/i)
    })
  })

  it('stored USER token on load → goes directly to member view', async () => {
    // 預先存入 token，模擬已登入狀態
    sessionStorage.setItem('token', USER_TOKEN)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    }))

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/subscription.*plans/i)
    })
  })
})
