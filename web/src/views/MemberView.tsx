import React, { useEffect, useState } from 'react'
import { PlanGrid } from '../components/member/PlanGrid'
import { SubscriptionPanel } from '../components/member/SubscriptionPanel'
import { SubscriptionHistory } from '../components/member/SubscriptionHistory'
import { listSubscriptions } from '../api/client'
import type { Plan, Subscription, MemberSubscription } from '../types'

export function MemberView() {
  // 後端清單為唯一來源，不再使用 localStorage（spec B2：移除 SUB_KEY/PLAN_KEY）
  const [subscriptions, setSubscriptions] = useState<MemberSubscription[]>([])

  const fetchSubs = async () => {
    try {
      const list = await listSubscriptions()
      setSubscriptions(list)
    } catch {
      // 未登入或網路錯誤時清空，不中斷 UX
      setSubscriptions([])
    }
  }

  // 持續輪詢清單：讓 admin 端造成的狀態變化（dunning ACTIVE→PAST_DUE→CANCELED、期末取消）
  // 即時反映到 history，免手動重整（沿用 SubscriptionPanel 的輪詢模式）。
  useEffect(() => {
    fetchSubs()
    const id = setInterval(fetchSubs, 3000)
    return () => clearInterval(id)
  }, [])

  // index 0 為「目前訂閱」（後端已依 startedAt 新→舊排序）
  const current = subscriptions[0] ?? null

  // 訂閱成功後 refetch，確保 current + history 一致
  const handleSubscribed = async (_sub: Subscription, _plan: Plan) => {
    await fetchSubs()
  }

  // 輪詢 / 取消時，將更新結果合併回清單（保留 planName / startedAt）
  const handleSubChange = (updated: Subscription) => {
    setSubscriptions(prev => {
      if (prev.length === 0) return prev
      const [head, ...tail] = prev
      return [{ ...head, ...updated } as MemberSubscription, ...tail]
    })
  }

  return (
    <main className="main-content">
      <h1 className="section-title">
        SUBSCRIPTION <span className="accent">PLANS</span>
      </h1>

      <PlanGrid onSubscribed={handleSubscribed} currentSubscription={current} />

      {current && (
        <div style={{ marginTop: '2rem' }}>
          <SubscriptionPanel
            key={current.id}
            initial={current as unknown as Subscription}
            planName={current.planName}
            onChange={handleSubChange}
          />
        </div>
      )}

      <div style={{ marginTop: '2rem' }}>
        <SubscriptionHistory subscriptions={subscriptions} />
      </div>
    </main>
  )
}
