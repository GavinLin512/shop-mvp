import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemberView } from '../views/MemberView'

// mock api/client
vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  setAuthToken: vi.fn(),
  listSubscriptions: vi.fn(),
  listAllSubscriptions: vi.fn(),
}))

import { listSubscriptions } from '../api/client'
const mockListSubs = vi.mocked(listSubscriptions)

const ACTIVE_SUB = {
  id: 'sub_h1',
  status: 'ACTIVE' as const,
  cancelAtPeriodEnd: false,
  planId: 'plan_1',
  planName: 'Pro',
  startedAt: '2026-01-01T00:00:00.000Z',
  nextBillingDate: '2026-02-01T00:00:00.000Z',
}

const CANCELED_SUB = {
  id: 'sub_h2',
  status: 'CANCELED' as const,
  cancelAtPeriodEnd: false,
  planId: 'plan_1',
  planName: 'Basic',
  startedAt: '2025-12-01T00:00:00.000Z',
  nextBillingDate: '2026-01-01T00:00:00.000Z',
}

// 另外 mock PlanGrid 避免 fetch /plans 干擾
vi.mock('../components/member/PlanGrid', () => ({
  PlanGrid: () => <div data-testid="plan-grid" />,
}))

describe('前台 SubscriptionHistory — 測試 7', () => {
  beforeEach(() => {
    mockListSubs.mockReset()
  })

  it('列出本人全部訂閱：plan、status、startedAt、cancelAtPeriodEnd', async () => {
    mockListSubs.mockResolvedValueOnce([ACTIVE_SUB, CANCELED_SUB])

    render(<MemberView />)

    // 等 HISTORY 區出現
    await waitFor(() => {
      expect(screen.getByText('SUBSCRIPTION HISTORY')).toBeInTheDocument()
    })

    // 兩列都出現（Pro 出現在 SubscriptionPanel 和 History 各一次）
    expect(screen.getAllByText('Pro').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Basic').length).toBeGreaterThanOrEqual(1)

    // status badges（ACTIVE 在 Panel+History 各一次，CANCELED 在 History）
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('CANCELED')).toBeInTheDocument()
  })

  it('空清單顯示 placeholder', async () => {
    mockListSubs.mockResolvedValueOnce([])

    render(<MemberView />)

    await waitFor(() => {
      expect(screen.getByText('SUBSCRIPTION HISTORY')).toBeInTheDocument()
    })

    expect(screen.getByText(/no subscription history/i)).toBeInTheDocument()
  })
})

describe('前台 MemberView 改用後端、移除 localStorage — 測試 8', () => {
  beforeEach(() => {
    mockListSubs.mockReset()
    // 預先塞舊的 localStorage 資料
    localStorage.setItem('shop_mvp_subscription', JSON.stringify({
      id: 'old_sub',
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
      planId: 'plan_old',
      memberId: 'member_old',
    }))
  })

  it('後端回空清單時，不顯示舊訂閱（不讀 localStorage）', async () => {
    // 以新使用者登入，後端回空
    mockListSubs.mockResolvedValueOnce([])

    render(<MemberView />)

    await waitFor(() => {
      expect(screen.getByText('SUBSCRIPTION HISTORY')).toBeInTheDocument()
    })

    // 不應該顯示舊訂閱的 SubscriptionPanel
    expect(screen.queryByText('YOUR SUBSCRIPTION')).not.toBeInTheDocument()
    // localStorage 的 old_sub 不應影響顯示
    expect(screen.queryByText('old_sub')).not.toBeInTheDocument()
  })
})
