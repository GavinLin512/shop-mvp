import React, { useEffect, useState } from 'react'
import { StatusBadge } from '../StatusBadge'
import { apiFetch, listAllSubscriptions } from '../../api/client'
import { formatCurrency } from '../../lib/money'
import type { AdminSubscription } from '../../types'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}

export function AdminSubscriptionList() {
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([])
  const [error, setError] = useState<string | null>(null)
  const [canceling, setCanceling] = useState<string | null>(null)

  const fetchList = async () => {
    try {
      const list = await listAllSubscriptions()
      setSubscriptions(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscriptions')
    }
  }

  useEffect(() => { fetchList() }, [])

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

  if (error) return <p className="error-text">{error}</p>

  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      {subscriptions.length === 0 ? (
        <p className="polling-note">No subscriptions found.</p>
      ) : (
        <table className="admin-table" style={{ minWidth: 'max-content', width: '100%' }}>
          <thead>
            <tr>
              {['Member', 'Plan', 'Amount', 'Status', 'Cancel at period end', 'Started at', 'Next billing', 'Action'].map(h => (
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
