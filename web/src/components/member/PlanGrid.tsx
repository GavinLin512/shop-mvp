import React, { useEffect, useState } from 'react'
import { PlanCard } from './PlanCard'
import { apiFetch } from '../../api/client'
import type { Plan, Subscription } from '../../types'

interface Props {
  onSubscribed: (sub: Subscription, plan: Plan) => void
  currentSubscription?: Subscription | null
}

export function PlanGrid({ onSubscribed, currentSubscription }: Props) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Plan[]>('/plans')
      .then(data => setPlans([...data].sort((a, b) => a.amount - b.amount)))
      .catch((err: Error) => setError(err.message))
  }, [])

  // cancelAtPeriodEnd=true 視為已確認取消，解除所有限制
  const isTrulyActive =
    currentSubscription?.status === 'ACTIVE' && !currentSubscription?.cancelAtPeriodEnd

  // Determine the recommended plan: the next tier above current by amount
  const currentPlanId = isTrulyActive ? currentSubscription!.planId : null
  const currentIndex = plans.findIndex(p => p.id === currentPlanId)
  const recommendedPlanId = currentPlanId
    ? plans[currentIndex + 1]?.id ?? null
    : plans[0]?.id ?? null  // no subscription → recommend the cheapest

  const isActive = isTrulyActive

  const handleSubscribe = async (plan: Plan) => {
    if (isActive) {
      setWarning('You already have an active subscription. Please cancel it before switching plans.')
      return
    }
    setWarning(null)
    setSubscribing(plan.id)
    setError(null)
    try {
      const sub = await apiFetch<Subscription>('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ planId: plan.id }),
      })
      onSubscribed(sub, plan)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to subscribe')
    } finally {
      setSubscribing(null)
    }
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
    </div>
  )
}
