import React, { useEffect, useRef, useState } from 'react'
import { StatusBadge } from '../StatusBadge'
import { apiFetch } from '../../api/client'
import type { Subscription } from '../../types'

interface Props {
  initial: Subscription
  planName?: string
  onChange?: (sub: Subscription) => void
}

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 20

// 將 ISO 日期字串格式化為當地日期（無效輸入則原樣回傳，避免顯示 Invalid Date）
function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}

export function SubscriptionPanel({ initial, planName, onChange }: Props) {
  const [sub, setSub] = useState<Subscription>(initial)

  const update = (next: Subscription) => {
    setSub(next)
    onChange?.(next)
  }
  const attemptsRef = useRef(0)

  // 與父層清單輪詢同步：admin 端造成 ACTIVE→PAST_DUE→CANCELED 時，
  // 即使本元件已停止自身輪詢，也能即時反映父層帶下來的最新狀態。
  // 只在實際欄位變動時同步，避免每次輪詢的新物件造成多餘 render。
  useEffect(() => {
    setSub(initial)
  }, [initial.status, initial.cancelAtPeriodEnd, initial.nextBillingDate])

  // 輪詢直到 ACTIVE 或 CANCELED，最多 POLL_MAX_ATTEMPTS 次
  useEffect(() => {
    if (sub.status === 'ACTIVE' || sub.status === 'CANCELED') return

    attemptsRef.current = 0
    const id = setInterval(async () => {
      if (attemptsRef.current >= POLL_MAX_ATTEMPTS) {
        clearInterval(id)
        return
      }
      attemptsRef.current++
      try {
        const updated = await apiFetch<Subscription>(`/subscriptions/${sub.id}`)
        update(updated)
        if (updated.status === 'ACTIVE' || updated.status === 'CANCELED') {
          clearInterval(id)
        }
      } catch {
        // 輪詢錯誤靜默忽略，不中斷 UX
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(id)
  }, [sub.id, sub.status])

  const handleCancel = async () => {
    if (!window.confirm('Cancel your subscription? You will retain access until the end of the current billing period.')) return
    try {
      const updated = await apiFetch<Subscription>(`/subscriptions/${sub.id}/cancel`, {
        method: 'POST',
      })
      update(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Cancel failed')
    }
  }

  return (
    <div className="sub-panel">
      <h2 className="panel-title">YOUR SUBSCRIPTION</h2>
      {planName && (
        <div className="sub-row">
          <span className="sub-label">Plan</span>
          <span className="sub-value">{planName}</span>
        </div>
      )}
      <div className="sub-row">
        <span className="sub-label">ID</span>
        <span className="sub-value">{sub.id}</span>
      </div>
      <div className="sub-row">
        <span className="sub-label">Status</span>
        <StatusBadge status={sub.status} cancelAtPeriodEnd={sub.cancelAtPeriodEnd} />
      </div>
      {/* 期末取消後顯示生效日期，讓使用者知道何時失去使用權（DECISION.md #9） */}
      {sub.cancelAtPeriodEnd && sub.nextBillingDate && (
        <div className="sub-row">
          <span className="sub-label">Access until</span>
          <span className="sub-value">{formatDate(sub.nextBillingDate)}</span>
        </div>
      )}
      {(sub.status === 'INCOMPLETE' || sub.status === 'PAST_DUE') && (
        <p className="polling-note">Processing payment… auto-refreshing</p>
      )}
      {sub.status === 'ACTIVE' && !sub.cancelAtPeriodEnd && (
        <button className="btn-ghost cancel-btn" onClick={handleCancel}>
          CANCEL AT PERIOD END
        </button>
      )}
    </div>
  )
}
