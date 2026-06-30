import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemberView } from '../views/MemberView'
import { AdminSubscriptionList } from '../components/admin/AdminSubscriptionList'

// mock api/client（兩個 view 都吃這支）
vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  setAuthToken: vi.fn(),
  listSubscriptions: vi.fn(),
  listAllSubscriptions: vi.fn(),
  demoExpire: vi.fn(),
}))

// PlanGrid 會打 /plans，mock 掉避免干擾
vi.mock('../components/member/PlanGrid', () => ({
  PlanGrid: () => <div data-testid="plan-grid" />,
}))

import { listSubscriptions, listAllSubscriptions } from '../api/client'
const mockListSubs = vi.mocked(listSubscriptions)
const mockListAll = vi.mocked(listAllSubscriptions)

// 同一筆訂閱的兩個狀態（模擬 admin 端 dunning 造成 ACTIVE → CANCELED）
const MEMBER_ACTIVE = {
  id: 'sub_live',
  status: 'ACTIVE' as const,
  cancelAtPeriodEnd: false,
  planId: 'plan_1',
  planName: 'Pro',
  startedAt: '2026-06-01T00:00:00.000Z',
  nextBillingDate: '2026-07-01T00:00:00.000Z',
}
const MEMBER_CANCELED = { ...MEMBER_ACTIVE, status: 'CANCELED' as const }

const ADMIN_ACTIVE = {
  id: 'sub_live',
  memberId: 'mem_1',
  memberEmail: 'alice@example.com',
  planName: 'Pro',
  amount: 999,
  currency: 'USD',
  status: 'ACTIVE' as const,
  cancelAtPeriodEnd: false,
  startedAt: '2026-06-01T00:00:00.000Z',
  nextBillingDate: '2026-07-01T00:00:00.000Z',
}
const ADMIN_CANCELED = { ...ADMIN_ACTIVE, status: 'CANCELED' as const }

describe('即時輪詢：member 端清單免重整自動更新', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockListSubs.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('history 隨輪詢自動從 ACTIVE 翻 CANCELED（不重新整理）', async () => {
    mockListSubs
      .mockResolvedValueOnce([MEMBER_ACTIVE]) // 掛載抓一次
      .mockResolvedValue([MEMBER_CANCELED])   // 之後每次輪詢

    render(<MemberView />)

    // 沖洗掛載時的抓取
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThanOrEqual(1)

    // 推進 3 秒 → 觸發一次清單輪詢 → 狀態變 CANCELED
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(screen.getAllByText('CANCELED').length).toBeGreaterThanOrEqual(1)
    expect(mockListSubs.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

describe('即時輪詢：admin 訂閱清單免重整自動更新', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockListAll.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('清單隨輪詢自動從 ACTIVE 翻 CANCELED（不重新整理）', async () => {
    mockListAll
      .mockResolvedValueOnce([ADMIN_ACTIVE])
      .mockResolvedValue([ADMIN_CANCELED])

    render(<AdminSubscriptionList />)

    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()

    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(screen.getByText('CANCELED')).toBeInTheDocument()
    expect(mockListAll.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
