import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from '../App'

describe('未登入保護', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('無 token → 只顯示登入表單，不顯示 SUBSCRIBE 按鈕', () => {
    render(<App />)

    // 必須看到登入表單
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()

    // 不應顯示 SUBSCRIBE（PlanGrid 未渲染）
    expect(screen.queryByRole('button', { name: /subscribe/i })).not.toBeInTheDocument()
  })

  it('無 token → 不打 /plans 或 /subscriptions（ConfigProvider 只打 /config）', () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ demoMode: false, provider: 'mock' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    // ConfigProvider 會打 /api/config，但不應打 /plans 或 /subscriptions
    const calls = fetchMock.mock.calls.map(c => c[0] as string)
    expect(calls.every(url => !url.includes('/plans') && !url.includes('/subscriptions'))).toBe(true)
  })
})
