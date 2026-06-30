import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminSubscriptionList } from '../components/admin/AdminSubscriptionList'

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  setAuthToken: vi.fn(),
  listAllSubscriptions: vi.fn(),
}))

import { apiFetch, listAllSubscriptions } from '../api/client'
const mockApiFetch = vi.mocked(apiFetch)
const mockListAll = vi.mocked(listAllSubscriptions)

const SUBS = [
  // 可取消：ACTIVE 且未 cancelAtPeriodEnd
  {
    id: 'sub_a1',
    memberId: 'mem_1',
    memberEmail: 'alice@example.com',
    planName: 'Pro',
    amount: 999,
    currency: 'USD',
    status: 'ACTIVE' as const,
    cancelAtPeriodEnd: false,
    startedAt: '2026-06-01T00:00:00.000Z',
    nextBillingDate: '2026-07-01T00:00:00.000Z',
  },
  // 不可取消：已 cancelAtPeriodEnd
  {
    id: 'sub_a2',
    memberId: 'mem_2',
    memberEmail: 'bob@example.com',
    planName: 'Basic',
    amount: 500,
    currency: 'USD',
    status: 'ACTIVE' as const,
    cancelAtPeriodEnd: true,
    startedAt: '2026-05-01T00:00:00.000Z',
    nextBillingDate: '2026-06-01T00:00:00.000Z',
  },
  // 不可取消：已 CANCELED
  {
    id: 'sub_a3',
    memberId: 'mem_3',
    memberEmail: 'carol@example.com',
    planName: 'Basic',
    amount: 500,
    currency: 'USD',
    status: 'CANCELED' as const,
    cancelAtPeriodEnd: false,
    startedAt: '2026-04-01T00:00:00.000Z',
    nextBillingDate: '2026-05-01T00:00:00.000Z',
  },
]

describe('後台 AdminSubscriptionList — 測試 9', () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
    mockListAll.mockReset()
  })

  it('三列都出現；取消鈕只在第一列（ACTIVE 未取消）', async () => {
    mockListAll.mockResolvedValueOnce(SUBS)

    render(<AdminSubscriptionList />)

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    })

    expect(screen.getByText('bob@example.com')).toBeInTheDocument()
    expect(screen.getByText('carol@example.com')).toBeInTheDocument()

    // 取消鈕只有一個（第一列）
    const cancelBtns = screen.getAllByRole('button', { name: /cancel/i })
    expect(cancelBtns).toHaveLength(1)
  })

  it('點擊取消鈕 → 呼叫 POST /subscriptions/:id/cancel → 成功後 refetch', async () => {
    mockListAll.mockResolvedValue(SUBS)
    mockApiFetch.mockResolvedValueOnce({ ...SUBS[0], cancelAtPeriodEnd: true })

    render(<AdminSubscriptionList />)

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/subscriptions/${SUBS[0].id}/cancel`,
        { method: 'POST' }
      )
      // 成功後 refetch（listAllSubscriptions 被呼叫第二次）
      expect(mockListAll).toHaveBeenCalledTimes(2)
    })
  })
})
