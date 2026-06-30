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

  it('無 token → fetch 不被呼叫（不嘗試打 /plans 或 /subscriptions）', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    // 僅渲染 LoginForm，不觸發任何 API call
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
