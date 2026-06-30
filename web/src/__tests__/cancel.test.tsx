import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SubscriptionPanel } from '../components/member/SubscriptionPanel'

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  setAuthToken: vi.fn(),
}))

import { apiFetch } from '../api/client'
const mockApiFetch = vi.mocked(apiFetch)

const ACTIVE_SUB = {
  id: 'sub_c1',
  status: 'ACTIVE' as const,
  cancelAtPeriodEnd: false,
  planId: 'plan_1',
  userId: 'user_1',
}

describe('期末取消 UX', () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
  })

  it('取消後 Badge 仍是 ACTIVE + 顯示 cancels at period end', async () => {
    // POST /subscriptions/:id/cancel 回 status=ACTIVE, cancelAtPeriodEnd=true
    mockApiFetch.mockResolvedValueOnce({
      ...ACTIVE_SUB,
      cancelAtPeriodEnd: true,
    })

    render(<SubscriptionPanel initial={ACTIVE_SUB} />)

    // 初始顯示取消按鈕
    const cancelBtn = screen.getByRole('button', { name: /cancel at period end/i })
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      // Badge 維持 ACTIVE（不變 CANCELED）
      expect(screen.getByText('ACTIVE')).toBeInTheDocument()
      expect(screen.queryByText('CANCELED')).not.toBeInTheDocument()
      // 顯示期末取消標記
      expect(screen.getByText(/cancels at period end/i)).toBeInTheDocument()
    })

    // 取消後按鈕應消失（已是 cancelAtPeriodEnd=true）
    expect(screen.queryByRole('button', { name: /cancel at period end/i })).not.toBeInTheDocument()
  })

  it('呼叫正確端點 POST /subscriptions/:id/cancel', async () => {
    mockApiFetch.mockResolvedValueOnce({ ...ACTIVE_SUB, cancelAtPeriodEnd: true })

    render(<SubscriptionPanel initial={ACTIVE_SUB} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel at period end/i }))

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/subscriptions/${ACTIVE_SUB.id}/cancel`,
        { method: 'POST' }
      )
    })
  })
})
