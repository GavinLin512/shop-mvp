import React, { useEffect, useState } from 'react'
import { PlanGrid } from '../components/member/PlanGrid'
import { SubscriptionPanel } from '../components/member/SubscriptionPanel'
import type { Plan, Subscription } from '../types'

const SUB_KEY = 'shop_mvp_subscription'
const PLAN_KEY = 'shop_mvp_plan_name'

export function MemberView() {
  const [subscription, setSubscription] = useState<Subscription | null>(() => {
    try {
      const stored = localStorage.getItem(SUB_KEY)
      return stored ? (JSON.parse(stored) as Subscription) : null
    } catch {
      return null
    }
  })
  const [planName, setPlanName] = useState<string>(() =>
    localStorage.getItem(PLAN_KEY) ?? ''
  )

  useEffect(() => {
    if (subscription) {
      localStorage.setItem(SUB_KEY, JSON.stringify(subscription))
    } else {
      localStorage.removeItem(SUB_KEY)
      localStorage.removeItem(PLAN_KEY)
    }
  }, [subscription])

  const handleSubscribed = (sub: Subscription, plan: Plan) => {
    setSubscription(sub)
    setPlanName(plan.name)
    localStorage.setItem(PLAN_KEY, plan.name)
  }

  return (
    <main className="main-content">
      <h1 className="section-title">
        SUBSCRIPTION <span className="accent">PLANS</span>
      </h1>

      <PlanGrid onSubscribed={handleSubscribed} currentSubscription={subscription} />

      {subscription && (
        <div style={{ marginTop: '2rem' }}>
          <SubscriptionPanel
            key={subscription.id}
            initial={subscription}
            planName={planName}
            onChange={setSubscription}
          />
        </div>
      )}
    </main>
  )
}
