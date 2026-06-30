import React, { useEffect, useState } from 'react'
import { StatusBadge } from '../StatusBadge'
import { apiFetch, listAllSubscriptions, demoExpire } from '../../api/client'
import { useConfig } from '../../lib/ConfigContext'
import { formatCurrency } from '../../lib/money'
import type { AdminSubscription } from '../../types'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}

export function AdminSubscriptionList() {
  const { demoMode } = useConfig()
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([])
  const [error, setError] = useState<string | null>(null)
  const [canceling, setCanceling] = useState<string | null>(null)
  const [expiring, setExpiring] = useState<string | null>(null)

  const fetchList = async () => {
    try {
      const list = await listAllSubscriptions()
      setSubscriptions(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscriptions')
    }
  }

  // 持續輪詢：admin 跑 billing/dunning 後，清單狀態與 next billing 即時更新，免手動重整
  // （沿用 MemberView / SubscriptionPanel 的輪詢模式）。
  useEffect(() => {
    fetchList()
    const id = setInterval(fetchList, 3000)
    return () => clearInterval(id)
  }, [])

  // 取消鈕只在 ACTIVE 且未 cancelAtPeriodEnd 顯示（DECISION.md #9）
  const canCancel = (s: AdminSubscription) =>
    s.status === 'ACTIVE' && !s.cancelAtPeriodEnd

  const handleCancel = async (id: string) => {
    setCanceling(id)
    try {
      await apiFetch(`/subscriptions/${id}/cancel`, { method: 'POST' })
      await fetchList()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed')
    } finally {
      setCanceling(null)
    }
  }

  const handleExpire = async (id: string) => {
    setExpiring(id)
    try {
      await demoExpire(id)
      await fetchList()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Expire failed')
    } finally {
      setExpiring(null)
    }
  }

  if (error) return <p className="error-text">{error}</p>

  return (
    <div className="table-scroll-wrap">
      {subscriptions.length === 0 ? (
        <p className="polling-note">No subscriptions found.</p>
      ) : (
        <table className="admin-table" style={{ minWidth: 'max-content', width: '100%' }}>
          <thead>
            <tr>
              {['Member', 'Plan', 'Amount', 'Status', 'Cancel at period end', 'Started at', 'Next billing', 'Action', ...(demoMode ? ['Demo'] : [])].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subscriptions.map(s => (
              <tr key={s.id}>
                <td>{s.memberEmail}</td>
                <td>{s.planName}</td>
                <td>{formatCurrency(s.amount, s.currency)}</td>
                <td><StatusBadge status={s.status} /></td>
                <td>{s.cancelAtPeriodEnd ? 'Yes' : 'No'}</td>
                <td>{formatDate(s.startedAt)}</td>
                <td>{formatDate(s.nextBillingDate ?? '')}</td>
                <td>
                  {canCancel(s) && (
                    <button
                      className="btn-ghost cancel-btn"
                      disabled={canceling === s.id}
                      onClick={() => handleCancel(s.id)}
                    >
                      {canceling === s.id ? 'CANCELING...' : 'CANCEL'}
                    </button>
                  )}
                </td>
                {demoMode && (
                  <td>
                    <button
                      className="btn-ghost"
                      disabled={expiring === s.id}
                      onClick={() => handleExpire(s.id)}
                    >
                      {expiring === s.id ? 'EXPIRING...' : 'MAKE DUE'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
