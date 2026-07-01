import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminView } from '../views/AdminView'
import { AdminSubscriptionList } from '../components/admin/AdminSubscriptionList'
import { DemoControlPanel } from '../components/admin/DemoControlPanel'

// ── Mock api/client ────────────────────────────────────────────────────────────
vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  setAuthToken: vi.fn(),
  listAllSubscriptions: vi.fn(),
  getConfig: vi.fn(),
  demoReset: vi.fn(),
  demoRunBilling: vi.fn(),
  demoExpire: vi.fn(),
  demoGetForceFail: vi.fn(),
  demoSetForceFail: vi.fn(),
  demoReplayWebhook: vi.fn(),
  demoGetProvider: vi.fn(),
  demoSetProvider: vi.fn(),
  createSubscription: vi.fn(),
}))

import {
  listAllSubscriptions,
  demoReset,
  demoRunBilling,
  demoExpire,
  demoGetForceFail,
  demoSetForceFail,
  demoReplayWebhook,
  demoGetProvider,
  demoSetProvider,
} from '../api/client'

const mockListAll = vi.mocked(listAllSubscriptions)
const mockDemoGetForceFail = vi.mocked(demoGetForceFail)
const mockDemoReset = vi.mocked(demoReset)
const mockDemoRunBilling = vi.mocked(demoRunBilling)
const mockDemoExpire = vi.mocked(demoExpire)
const mockDemoSetForceFail = vi.mocked(demoSetForceFail)
const mockDemoReplayWebhook = vi.mocked(demoReplayWebhook)
const mockDemoGetProvider = vi.mocked(demoGetProvider)
const mockDemoSetProvider = vi.mocked(demoSetProvider)

// ── Mock ConfigContext ─────────────────────────────────────────────────────────
vi.mock('../lib/ConfigContext', () => ({
  ConfigProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useConfig: vi.fn(),
}))

import { useConfig } from '../lib/ConfigContext'
const mockUseConfig = vi.mocked(useConfig)

// ── Mock auth (for AdminView) ──────────────────────────────────────────────────
vi.mock('../auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: vi.fn(() => ({ token: 'fake', role: 'ADMIN', userId: 'u1' })),
}))

// ── Mock child components to isolate AdminView tests ──────────────────────────
vi.mock('../components/admin/CreatePlanForm', () => ({
  CreatePlanForm: () => <div data-testid="create-plan-form" />,
}))
vi.mock('../components/admin/PlanLookup', () => ({
  PlanLookup: () => <div data-testid="plan-lookup" />,
}))
vi.mock('../components/admin/AdminSubscriptionList', async () => {
  const actual = await vi.importActual('../components/admin/AdminSubscriptionList')
  return actual
})

const SUBS = [
  {
    id: 'sub_1',
    memberId: 'mem_1',
    memberEmail: 'alice@example.com',
    planName: 'Pro',
    amount: 1000,
    currency: 'USD',
    status: 'ACTIVE' as const,
    cancelAtPeriodEnd: false,
    startedAt: '2026-06-01T00:00:00.000Z',
    nextBillingDate: '2026-07-01T00:00:00.000Z',
    billedCount: 1,
    lastBilledAt: '2026-06-01T00:00:00.000Z',
  },
]

beforeEach(() => {
  mockUseConfig.mockReturnValue({ demoMode: false, provider: 'mock', stripeConfigured: false, refetchConfig: async () => {} })
  mockListAll.mockResolvedValue([])
  mockDemoReset.mockResolvedValue({ ok: true })
  mockDemoRunBilling.mockResolvedValue({ processed: 1, skipped: 0 })
  mockDemoExpire.mockResolvedValue({})
  mockDemoGetForceFail.mockResolvedValue({ enabled: false })
  mockDemoSetForceFail.mockResolvedValue({ ok: true, forceFail: true })
  mockDemoReplayWebhook.mockResolvedValue({ ok: true, duplicate: true })
  mockDemoGetProvider.mockResolvedValue({ current: 'mock', stripeConfigured: false })
  mockDemoSetProvider.mockResolvedValue({ ok: true, current: 'mock' })
})

// ── 12. demoMode=false → 無 DEMO CONTROL 區塊 ────────────────────────────────

describe('19-demo-control 12. demoMode=false → 無 DEMO CONTROL 區塊', () => {
  it('DEMO CONTROL section 不渲染', async () => {
    mockUseConfig.mockReturnValue({ demoMode: false, provider: 'mock', stripeConfigured: false, refetchConfig: async () => {} })
    render(<AdminView />)
    await waitFor(() => {
      expect(screen.queryByText('DEMO CONTROL')).not.toBeInTheDocument()
    })
  })
})

// ── 13. provider='stripe' → 隱藏 force-fail / replay ──────────────────────────

describe('19-demo-control 13. provider=stripe → 無 force-fail / replay 鈕', () => {
  it('force-fail 和 replay 鈕不渲染；顯示測試卡說明', async () => {
    mockUseConfig.mockReturnValue({ demoMode: true, provider: 'stripe', stripeConfigured: true, refetchConfig: async () => {} })
    render(<DemoControlPanel />)

    // 按鈕不存在
    expect(screen.queryByRole('button', { name: /force-fail/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /replay/i })).not.toBeInTheDocument()
    // 顯示測試卡說明
    expect(screen.getByText(/4000002500003155/)).toBeInTheDocument()
  })
})

// ── 13b. provider='mock' → 顯示 force-fail / replay 鈕 ─────────────────────

describe('19-demo-control 13b. provider=mock → 顯示 force-fail / replay 鈕', () => {
  it('兩個 Mock 專屬按鈕都可見', () => {
    mockUseConfig.mockReturnValue({ demoMode: true, provider: 'mock', stripeConfigured: false, refetchConfig: async () => {} })
    render(<DemoControlPanel />)

    expect(screen.getByRole('button', { name: /FORCE-FAIL/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /REPLAY WEBHOOK/i })).toBeInTheDocument()
  })

  it('掛載時讀回 force-fail 真實狀態：後端回 enabled:true → 開關顯示 ON（reload 不假性 OFF）', async () => {
    mockUseConfig.mockReturnValue({ demoMode: true, provider: 'mock', stripeConfigured: false, refetchConfig: async () => {} })
    mockDemoGetForceFail.mockResolvedValueOnce({ enabled: true })
    render(<DemoControlPanel />)

    // 初始化抓取後，開關應顯示 ON
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /FORCE-FAIL: ON/i })).toBeInTheDocument()
    })
  })
})

// ── 14. Reset type-to-confirm ─────────────────────────────────────────────────

describe('19-demo-control 14. Reset 需輸入 RESET 才能按', () => {
  it('輸入框空時 RESET 鈕 disabled', () => {
    mockUseConfig.mockReturnValue({ demoMode: true, provider: 'mock', stripeConfigured: false, refetchConfig: async () => {} })
    render(<DemoControlPanel />)
    const btn = screen.getByRole('button', { name: /^RESET$/i })
    expect(btn).toBeDisabled()
  })

  it('輸入 RESET → 按鈕啟用，點擊後呼叫 demoReset()', async () => {
    mockUseConfig.mockReturnValue({ demoMode: true, provider: 'mock', stripeConfigured: false, refetchConfig: async () => {} })
    render(<DemoControlPanel />)

    const input = screen.getByPlaceholderText(/type reset/i)
    const btn = screen.getByRole('button', { name: /^RESET$/i })

    fireEvent.change(input, { target: { value: 'RESET' } })
    expect(btn).not.toBeDisabled()

    fireEvent.click(btn)
    await waitFor(() => {
      expect(mockDemoReset).toHaveBeenCalledTimes(1)
    })
  })
})

// ── 14b. MAKE DUE 呼叫 demoExpire 後 refetch ──────────────────────────────────

describe('19-demo-control 14b. MAKE DUE 呼叫 expire 後 refetch', () => {
  it('demoMode=true 時每列有 MAKE DUE 鈕；點擊後呼叫 demoExpire + refetch', async () => {
    mockUseConfig.mockReturnValue({ demoMode: true, provider: 'mock', stripeConfigured: false, refetchConfig: async () => {} })
    mockListAll.mockResolvedValue(SUBS)
    mockDemoExpire.mockResolvedValue({})

    render(<AdminSubscriptionList />)

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    })

    const makeDueBtn = screen.getByRole('button', { name: /make due/i })
    expect(makeDueBtn).toBeInTheDocument()

    fireEvent.click(makeDueBtn)

    await waitFor(() => {
      expect(mockDemoExpire).toHaveBeenCalledWith('sub_1')
      // refetch: listAllSubscriptions 被呼叫第二次
      expect(mockListAll).toHaveBeenCalledTimes(2)
    })
  })

  it('demoMode=false 時不顯示 MAKE DUE 鈕', async () => {
    mockUseConfig.mockReturnValue({ demoMode: false, provider: 'mock', stripeConfigured: false, refetchConfig: async () => {} })
    mockListAll.mockResolvedValue(SUBS)

    render(<AdminSubscriptionList />)

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /make due/i })).not.toBeInTheDocument()
  })
})
