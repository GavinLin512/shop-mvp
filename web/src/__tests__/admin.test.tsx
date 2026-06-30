import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreatePlanForm } from '../components/admin/CreatePlanForm'
import { PlanLookup } from '../components/admin/PlanLookup'

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  setAuthToken: vi.fn(),
}))

import { apiFetch } from '../api/client'
const mockApiFetch = vi.mocked(apiFetch)

const NEW_PLAN = {
  id: 'plan_new',
  name: 'Pro',
  amount: 999,
  currency: 'USD',
  intervalDays: 30,
}

const PLANS = [
  { id: 'plan_basic', name: 'Basic', amount: 500, currency: 'USD', intervalDays: 30 },
  { id: 'plan_pro', name: 'Pro', amount: 999, currency: 'USD', intervalDays: 30 },
]

describe('後台建立 Plan', () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
  })

  it('填表送出 → 呼叫 POST /plans，body 正確', async () => {
    mockApiFetch.mockResolvedValueOnce(NEW_PLAN)

    render(<CreatePlanForm />)

    fireEvent.change(screen.getByLabelText(/plan name/i), { target: { value: 'Pro' } })
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '999' } })
    // currency 預設 USD
    fireEvent.change(screen.getByLabelText(/interval/i), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: /create plan/i }))

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/plans', {
        method: 'POST',
        body: JSON.stringify({ name: 'Pro', amount: 999, currency: 'USD', intervalDays: 30 }),
      })
    })
  })

  it('成功後顯示新方案名稱', async () => {
    mockApiFetch.mockResolvedValueOnce(NEW_PLAN)

    render(<CreatePlanForm />)

    fireEvent.change(screen.getByLabelText(/plan name/i), { target: { value: 'Pro' } })
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '999' } })
    fireEvent.change(screen.getByLabelText(/interval/i), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: /create plan/i }))

    await waitFor(() => {
      expect(screen.getByText('Pro')).toBeInTheDocument()
    })
  })
})

describe('後台篩選方案', () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
  })

  it('掛載時呼叫 GET /plans 並列出方案', async () => {
    mockApiFetch.mockResolvedValueOnce(PLANS)

    render(<PlanLookup />)

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/plans')
    })
    expect(screen.getByText('Basic')).toBeInTheDocument()
    expect(screen.getByText('Pro')).toBeInTheDocument()
  })

  it('輸入關鍵字 → 只顯示名稱符合的方案', async () => {
    mockApiFetch.mockResolvedValueOnce(PLANS)

    render(<PlanLookup />)

    await screen.findByText('Basic')
    fireEvent.change(screen.getByPlaceholderText(/filter by name/i), {
      target: { value: 'pro' },
    })

    expect(screen.getByText('Pro')).toBeInTheDocument()
    expect(screen.queryByText('Basic')).not.toBeInTheDocument()
  })
})
