import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { SubscriptionPanel } from '../components/member/SubscriptionPanel'

// mock api/client，讓 apiFetch 可被測試控制
vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  setAuthToken: vi.fn(),
}))

import { apiFetch } from '../api/client'
const mockApiFetch = vi.mocked(apiFetch)

const BASE_SUB = {
  id: 'sub_test1',
  status: 'INCOMPLETE' as const,
  cancelAtPeriodEnd: false,
  planId: 'plan_1',
  memberId: 'member_1',
}

describe('Subscription polling: INCOMPLETE → ACTIVE', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockApiFetch.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('badge 從 INCOMPLETE 輪詢後自動翻 ACTIVE', async () => {
    // 第一次 poll 回 INCOMPLETE，第二次回 ACTIVE
    mockApiFetch
      .mockResolvedValueOnce({ ...BASE_SUB, status: 'INCOMPLETE' })
      .mockResolvedValueOnce({ ...BASE_SUB, status: 'ACTIVE' })

    render(<SubscriptionPanel initial={BASE_SUB} />)

    expect(screen.getByText('INCOMPLETE')).toBeInTheDocument()

    // 觸發第一次輪詢（2 秒）
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    // 第一次仍 INCOMPLETE
    expect(screen.getByText('INCOMPLETE')).toBeInTheDocument()

    // 觸發第二次輪詢
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    // 翻為 ACTIVE
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
    expect(screen.queryByText('INCOMPLETE')).not.toBeInTheDocument()
  })

  it('已經是 ACTIVE 時不啟動輪詢', () => {
    const activeSub = { ...BASE_SUB, status: 'ACTIVE' as const }
    render(<SubscriptionPanel initial={activeSub} />)

    // 推進時間，apiFetch 不該被呼叫
    vi.advanceTimersByTime(10000)
    expect(mockApiFetch).not.toHaveBeenCalled()
  })
})
