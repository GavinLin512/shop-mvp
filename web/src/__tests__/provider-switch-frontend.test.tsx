/**
 * 20-runtime-provider-switch 前端測試（test.md checklist 19–24）
 * fetch 與 @stripe/* 全程 mock。
 */
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { CreateSubscriptionResult, Subscription, MemberSubscription } from '../types'

// ── mock api/client ────────────────────────────────────────────────────────────

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  setAuthToken: vi.fn(),
  getConfig: vi.fn(),
  listSubscriptions: vi.fn(),
  createSubscription: vi.fn(),
  demoGetProvider: vi.fn(),
  demoSetProvider: vi.fn(),
  demoGetForceFail: vi.fn(),
  demoSetForceFail: vi.fn(),
  demoReplayWebhook: vi.fn(),
  demoReset: vi.fn(),
  demoRunBilling: vi.fn(),
  demoExpire: vi.fn(),
  listAllSubscriptions: vi.fn(),
}))

import {
  createSubscription,
  demoGetProvider,
  demoSetProvider,
  demoGetForceFail,
} from '../api/client'

const mockCreateSubscription = vi.mocked(createSubscription)
const mockDemoGetProvider = vi.mocked(demoGetProvider)
const mockDemoSetProvider = vi.mocked(demoSetProvider)
const mockDemoGetForceFail = vi.mocked(demoGetForceFail)

// ── mock @stripe/react-stripe-js ───────────────────────────────────────────────

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div data-testid="stripe-elements">{children}</div>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: vi.fn(() => ({
    confirmPayment: vi.fn().mockResolvedValue({ error: null }),
  })),
  useElements: vi.fn(() => ({})),
}))

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockResolvedValue({}),
}))

// ── mock ConfigContext ─────────────────────────────────────────────────────────

vi.mock('../lib/ConfigContext', () => ({
  ConfigProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useConfig: vi.fn(),
}))

import { useConfig } from '../lib/ConfigContext'
const mockUseConfig = vi.mocked(useConfig)

import { useStripe } from '@stripe/react-stripe-js'
const mockUseStripe = vi.mocked(useStripe)

// ── mock auth ─────────────────────────────────────────────────────────────────

vi.mock('../auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: vi.fn(() => ({ token: 'fake', role: 'USER', userId: 'u1' })),
}))

// ── mock PlanCard ─────────────────────────────────────────────────────────────

vi.mock('../components/member/PlanCard', () => ({
  PlanCard: ({
    plan,
    onSubscribe,
    isRecommended,
    isCurrent,
  }: {
    plan: { id: string; name: string }
    onSubscribe: (p: unknown) => void
    isRecommended?: boolean
    isCurrent?: boolean
  }) => (
    <button
      data-testid={`plan-${plan.id}`}
      data-recommended={isRecommended ? 'true' : 'false'}
      data-current={isCurrent ? 'true' : 'false'}
      onClick={() => onSubscribe(plan)}
    >
      {plan.name}
    </button>
  ),
}))

// ── helpers ────────────────────────────────────────────────────────────────────

const mockSub: Subscription = {
  id: 'sub_test',
  status: 'INCOMPLETE',
  cancelAtPeriodEnd: false,
  planId: 'plan_test',
}

const mockPlan = { id: 'plan_test', name: 'Basic', amount: 1000, currency: 'TWD', intervalDays: 30 }

// ── 19. clientSecret 存在 → 渲染 PaymentElement ───────────────────────────────

describe('20-frontend 19. 回應有 clientSecret → 渲染 PaymentElement', () => {
  it('Stripe mock → 顯示 <PaymentElement>', async () => {
    mockUseConfig.mockReturnValue({
      demoMode: true,
      provider: 'stripe',
      stripeConfigured: true,
      publishableKey: 'pk_test_mock',
      refetchConfig: async () => {},
    })

    const result: CreateSubscriptionResult = {
      subscription: mockSub,
      clientSecret: 'pi_test_secret',
    }
    mockCreateSubscription.mockResolvedValue(result)

    // mock /plans
    const { apiFetch } = await import('../api/client')
    vi.mocked(apiFetch).mockResolvedValue([mockPlan])

    const { PlanGrid } = await import('../components/member/PlanGrid')
    const onSubscribed = vi.fn()
    render(<PlanGrid onSubscribed={onSubscribed} />)

    await waitFor(() => expect(screen.getByTestId('plan-plan_test')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('plan-plan_test'))

    await waitFor(() => {
      expect(screen.getByTestId('stripe-elements')).toBeInTheDocument()
      expect(screen.getByTestId('payment-element')).toBeInTheDocument()
    })
  })
})

// ── 20. 無 clientSecret（Mock）→ 不渲染 PaymentElement，直接輪詢 ───────────────

describe('20-frontend 20. 無 clientSecret → 不渲染 PaymentElement', () => {
  it('Mock → onSubscribed 立即呼叫，無 PaymentElement', async () => {
    mockUseConfig.mockReturnValue({
      demoMode: true,
      provider: 'mock',
      stripeConfigured: false,
      refetchConfig: async () => {},
    })

    const result: CreateSubscriptionResult = { subscription: mockSub }
    mockCreateSubscription.mockResolvedValue(result)

    const { apiFetch } = await import('../api/client')
    vi.mocked(apiFetch).mockResolvedValue([mockPlan])

    const { PlanGrid } = await import('../components/member/PlanGrid')
    const onSubscribed = vi.fn()
    render(<PlanGrid onSubscribed={onSubscribed} />)

    await waitFor(() => expect(screen.getByTestId('plan-plan_test')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('plan-plan_test'))

    await waitFor(() => expect(onSubscribed).toHaveBeenCalledWith(mockSub, expect.any(Object)))
    expect(screen.queryByTestId('payment-element')).not.toBeInTheDocument()
  })
})

// ── 21. DemoControlPanel 掛載讀 GET /demo/provider ───────────────────────────

describe('20-frontend 21. DemoControlPanel 掛載讀 GET /demo/provider', () => {
  it('掛載後呼叫 demoGetProvider，顯示 current provider', async () => {
    mockUseConfig.mockReturnValue({
      demoMode: true,
      provider: 'mock',
      stripeConfigured: false,
      refetchConfig: async () => {},
    })
    mockDemoGetProvider.mockResolvedValue({ current: 'mock', stripeConfigured: false })
    mockDemoGetForceFail.mockResolvedValue({ enabled: false })

    const { DemoControlPanel } = await import('../components/admin/DemoControlPanel')
    render(<DemoControlPanel />)

    await waitFor(() => expect(mockDemoGetProvider).toHaveBeenCalled())
    // "Current: " 和 "MOCK" 分別在 <p> 和 <strong>，查 strong 內文字
    await waitFor(() => expect(screen.getByText('MOCK')).toBeInTheDocument())
  })
})

// ── 22. stripeConfigured=false → Stripe 選項 disabled ─────────────────────────

describe('20-frontend 22. stripeConfigured=false → Stripe 選項 disabled', () => {
  it('Stripe 切換按鈕 disabled 並有提示', async () => {
    mockUseConfig.mockReturnValue({
      demoMode: true,
      provider: 'mock',
      stripeConfigured: false,
      refetchConfig: async () => {},
    })
    mockDemoGetProvider.mockResolvedValue({ current: 'mock', stripeConfigured: false })
    mockDemoGetForceFail.mockResolvedValue({ enabled: false })

    const { DemoControlPanel } = await import('../components/admin/DemoControlPanel')
    render(<DemoControlPanel />)

    await waitFor(() => screen.getByText(/USE STRIPE/i))
    const stripeBtn = screen.getByText(/USE STRIPE/i)
    expect(stripeBtn).toBeDisabled()
    expect(screen.getByText(/Stripe not configured/i)).toBeInTheDocument()
  })
})

// ── 23. 切換成功後 refetch /config ────────────────────────────────────────────

describe('20-frontend 23. 切換成功後 refetch /config', () => {
  it('demoSetProvider 成功後呼叫 refetchConfig', async () => {
    const refetchConfig = vi.fn().mockResolvedValue(undefined)
    mockUseConfig.mockReturnValue({
      demoMode: true,
      provider: 'mock',
      stripeConfigured: true,
      refetchConfig,
    })
    mockDemoGetProvider.mockResolvedValue({ current: 'mock', stripeConfigured: true })
    mockDemoSetProvider.mockResolvedValue({ ok: true, current: 'stripe' })
    mockDemoGetForceFail.mockResolvedValue({ enabled: false })

    const { DemoControlPanel } = await import('../components/admin/DemoControlPanel')
    render(<DemoControlPanel />)

    await waitFor(() => screen.getByText(/USE STRIPE/i))
    fireEvent.click(screen.getByText(/USE STRIPE/i))

    await waitFor(() => expect(mockDemoSetProvider).toHaveBeenCalledWith('stripe'))
    await waitFor(() => expect(refetchConfig).toHaveBeenCalled())
  })
})

// ── 24. demo-autofill 一鍵測試卡（4242） ──────────────────────────────────────

describe('20-frontend 24. demo-autofill 一鍵測試卡', () => {
  it('demoMode=true → 點 USE TEST CARD 以 pm_card_visa confirm 後 onSubscribed', async () => {
    // 注入可斷言的 confirmCardPayment（autofill 走這條，非 confirmPayment）
    const confirmCardPayment = vi.fn().mockResolvedValue({ error: null })
    mockUseStripe.mockReturnValue({
      confirmPayment: vi.fn().mockResolvedValue({ error: null }),
      confirmCardPayment,
    } as any)

    mockUseConfig.mockReturnValue({
      demoMode: true,
      provider: 'stripe',
      stripeConfigured: true,
      publishableKey: 'pk_test_mock',
      refetchConfig: async () => {},
    })
    mockCreateSubscription.mockResolvedValue({ subscription: mockSub, clientSecret: 'pi_test_secret' })

    const { apiFetch } = await import('../api/client')
    vi.mocked(apiFetch).mockResolvedValue([mockPlan])

    const { PlanGrid } = await import('../components/member/PlanGrid')
    const onSubscribed = vi.fn()
    render(<PlanGrid onSubscribed={onSubscribed} />)

    await waitFor(() => expect(screen.getByTestId('plan-plan_test')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('plan-plan_test'))

    // 收卡區出現後才有 demo 捷徑按鈕
    await waitFor(() => expect(screen.getByText(/USE TEST CARD/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/USE TEST CARD/i))

    await waitFor(() =>
      expect(confirmCardPayment).toHaveBeenCalledWith('pi_test_secret', { payment_method: 'pm_card_visa' }),
    )
    await waitFor(() => expect(onSubscribed).toHaveBeenCalled())
  })

  it('demoMode=false → 不渲染 USE TEST CARD（正式環境隔離）', async () => {
    mockUseStripe.mockReturnValue({
      confirmPayment: vi.fn().mockResolvedValue({ error: null }),
    } as any)

    mockUseConfig.mockReturnValue({
      demoMode: false,
      provider: 'stripe',
      stripeConfigured: true,
      publishableKey: 'pk_test_mock',
      refetchConfig: async () => {},
    })
    mockCreateSubscription.mockResolvedValue({ subscription: mockSub, clientSecret: 'pi_test_secret' })

    const { apiFetch } = await import('../api/client')
    vi.mocked(apiFetch).mockResolvedValue([mockPlan])

    const { PlanGrid } = await import('../components/member/PlanGrid')
    render(<PlanGrid onSubscribed={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('plan-plan_test')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('plan-plan_test'))

    // 收卡區仍渲染，但 demo 捷徑按鈕不出現
    await waitFor(() => expect(screen.getByTestId('payment-element')).toBeInTheDocument())
    expect(screen.queryByText(/USE TEST CARD/i)).not.toBeInTheDocument()
  })
})

// ── 行銷升級推薦：以歷史最高方案推上一階 ──────────────────────────────────────

describe('PlanGrid 行銷推薦（歷史最高方案 → 推上一階）', () => {
  // 三階方案，刻意打亂順序，驗證元件內部會依 amount 升冪排序
  const tierPlans = [
    { id: 'pro', name: 'Pro', amount: 2000, currency: 'TWD', intervalDays: 30 },
    { id: 'max', name: 'Max', amount: 3000, currency: 'TWD', intervalDays: 30 },
    { id: 'basic', name: 'Basic', amount: 1000, currency: 'TWD', intervalDays: 30 },
  ]

  function makeMemberSub(planId: string, status: MemberSubscription['status']): MemberSubscription {
    return {
      id: `sub_${planId}`,
      status,
      cancelAtPeriodEnd: false,
      planId,
      planName: planId,
      billedCount: 0,
      lastBilledAt: null,
      startedAt: new Date().toISOString(),
    }
  }

  beforeEach(() => {
    mockUseConfig.mockReturnValue({
      demoMode: true,
      provider: 'mock',
      stripeConfigured: false,
      refetchConfig: async () => {},
    })
  })

  async function renderGrid(history: MemberSubscription[]) {
    const { apiFetch } = await import('../api/client')
    vi.mocked(apiFetch).mockResolvedValue(tierPlans)
    const { PlanGrid } = await import('../components/member/PlanGrid')
    render(<PlanGrid onSubscribed={vi.fn()} subscriptionHistory={history} />)
    await waitFor(() => expect(screen.getByTestId('plan-basic')).toBeInTheDocument())
  }

  it('歷史最高為 Basic → 推薦上一階 Pro', async () => {
    await renderGrid([makeMemberSub('basic', 'CANCELED')])
    expect(screen.getByTestId('plan-pro').getAttribute('data-recommended')).toBe('true')
    expect(screen.getByTestId('plan-basic').getAttribute('data-recommended')).toBe('false')
    expect(screen.getByTestId('plan-max').getAttribute('data-recommended')).toBe('false')
  })

  it('歷史含多筆（Basic+Pro）取最高 Pro → 推薦 Max', async () => {
    await renderGrid([
      makeMemberSub('basic', 'CANCELED'),
      makeMemberSub('pro', 'CANCELED'),
    ])
    expect(screen.getByTestId('plan-max').getAttribute('data-recommended')).toBe('true')
  })

  it('歷史已達頂階 Max → 無推薦徽章', async () => {
    await renderGrid([makeMemberSub('max', 'CANCELED')])
    expect(screen.getByTestId('plan-basic').getAttribute('data-recommended')).toBe('false')
    expect(screen.getByTestId('plan-pro').getAttribute('data-recommended')).toBe('false')
    expect(screen.getByTestId('plan-max').getAttribute('data-recommended')).toBe('false')
  })

  it('無任何歷史 → 推薦最便宜入門款 Basic', async () => {
    await renderGrid([])
    expect(screen.getByTestId('plan-basic').getAttribute('data-recommended')).toBe('true')
  })

  it('高階 Max 為純 INCOMPLETE（首扣未成功）不計 → 仍以曾啟用的 Basic 推 Pro', async () => {
    await renderGrid([
      makeMemberSub('basic', 'CANCELED'),   // 曾啟用
      makeMemberSub('max', 'INCOMPLETE'),   // 首扣未成功，不計
    ])
    expect(screen.getByTestId('plan-pro').getAttribute('data-recommended')).toBe('true')
    expect(screen.getByTestId('plan-max').getAttribute('data-recommended')).toBe('false')
  })

  it('全部歷史皆 INCOMPLETE → 視同無啟用，推入門款 Basic', async () => {
    await renderGrid([makeMemberSub('pro', 'INCOMPLETE')])
    expect(screen.getByTestId('plan-basic').getAttribute('data-recommended')).toBe('true')
  })
})
