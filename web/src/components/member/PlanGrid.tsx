import React, { useEffect, useState } from 'react'
import { PlanCard } from './PlanCard'
import { StripePaymentForm } from './StripePaymentForm'
import { createSubscription } from '../../api/client'
import { useConfig } from '../../lib/ConfigContext'
import type { Plan, Subscription, MemberSubscription } from '../../types'

interface Props {
  onSubscribed: (sub: Subscription, plan: Plan) => void
  currentSubscription?: Subscription | null
  /** 會員歷史訂閱清單，用於行銷升級推薦（以歷史最高方案為基準推上一階） */
  subscriptionHistory?: MemberSubscription[]
}

export function PlanGrid({ onSubscribed, currentSubscription, subscriptionHistory = [] }: Props) {
  const { publishableKey } = useConfig()
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  /** Stripe 首扣：需收卡的 clientSecret + 對應的 subscription */
  const [pendingStripe, setPendingStripe] = useState<{
    clientSecret: string
    subscription: Subscription
    plan: Plan
  } | null>(null)

  // plan-warning 顯示 5 秒後自動消失；再次觸發或卸載時清掉舊 timer 避免殘留
  useEffect(() => {
    if (!warning) return
    const timer = setTimeout(() => setWarning(null), 5000)
    return () => clearTimeout(timer)
  }, [warning])

  useEffect(() => {
    import('../../api/client').then(({ apiFetch }) =>
      (apiFetch as typeof import('../../api/client').apiFetch)<Plan[]>('/plans')
        .then(data => setPlans([...data].sort((a, b) => a.amount - b.amount)))
        .catch((err: Error) => setError(err.message))
    )
  }, [])

  // cancelAtPeriodEnd=true 視為已確認取消，解除所有限制
  const isTrulyActive =
    currentSubscription?.status === 'ACTIVE' && !currentSubscription?.cancelAtPeriodEnd

  // 「目前方案」徽章：仍以當前 ACTIVE 訂閱為準
  const currentPlanId = isTrulyActive ? currentSubscription!.planId : null

  // 行銷升級推薦：以「歷史曾啟用過的最高金額方案」為基準推上一階，引導 upsell。
  // 只計曾啟用過的訂閱（排除純 INCOMPLETE 首扣未成功者），避免從沒付款成功的訂閱墊高推薦階。
  // 註：前端 DTO 只有 status，無法區分「ACTIVE 後取消」與「首扣失敗直接 CANCELED」，
  //     此為 best-effort 啟發式；以 status !== 'INCOMPLETE' 近似「曾啟用」。
  // 歷史 DTO 只帶 planId，需對照已抓的 plans（依 amount 升冪）取得階層；
  // 找出最高階 index 推其上一階，已達頂階則不推薦；無歷史 → 推入門款（最便宜）。
  const historyPlanIds = new Set(
    subscriptionHistory.filter(s => s.status !== 'INCOMPLETE').map(s => s.planId),
  )
  let maxTierIndex = -1
  plans.forEach((p, i) => {
    if (historyPlanIds.has(p.id)) maxTierIndex = i
  })
  const recommendedPlanId =
    maxTierIndex >= 0
      ? plans[maxTierIndex + 1]?.id ?? null  // 上一階；已達頂階則無
      : plans[0]?.id ?? null                 // 無歷史 → 推薦最便宜的入門款

  // 防重疊：付費週期尚未結束（含已標期末取消的 ACTIVE）就不可再訂閱，
  // 須等期末 cron 翻成 CANCELED 後才放行，與後端 409 守衛一致（避免雙重佔用同一段期間）。
  const isInFlight =
    currentSubscription != null &&
    ['INCOMPLETE', 'ACTIVE', 'PAST_DUE'].includes(currentSubscription.status)

  const handleSubscribe = async (plan: Plan) => {
    if (isInFlight) {
      setWarning('You already have a subscription in its current period. Wait for it to end before subscribing again.')
      return
    }
    setWarning(null)
    setSubscribing(plan.id)
    setError(null)
    try {
      const result = await createSubscription(plan.id)
      if (result.clientSecret && publishableKey) {
        // Stripe 首扣：有 clientSecret，顯示收卡畫面（ADR-0013）
        setPendingStripe({ clientSecret: result.clientSecret, subscription: result.subscription, plan })
      } else {
        // Mock：無 clientSecret，直接輪詢（現狀不破）
        onSubscribed(result.subscription, plan)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to subscribe')
    } finally {
      setSubscribing(null)
    }
  }

  // Stripe confirm 成功後進輪詢
  const handleStripeSuccess = (sub: Subscription) => {
    if (!pendingStripe) return
    const plan = pendingStripe.plan
    setPendingStripe(null)
    onSubscribed(sub, plan)
  }

  if (error) return <p className="error-text">{error}</p>

  return (
    <div>
      {warning && <p className="plan-warning">{warning}</p>}
      <div className="plan-grid">
        {plans.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onSubscribe={handleSubscribe}
            subscribing={subscribing === plan.id}
            isCurrent={plan.id === currentPlanId}
            isRecommended={plan.id === recommendedPlanId}
          />
        ))}
      </div>

      {/* Stripe 收卡畫面（只在有 clientSecret 時顯示） */}
      {pendingStripe && publishableKey && (
        <StripePaymentForm
          clientSecret={pendingStripe.clientSecret}
          publishableKey={publishableKey}
          subscription={pendingStripe.subscription}
          onSuccess={handleStripeSuccess}
        />
      )}
    </div>
  )
}
