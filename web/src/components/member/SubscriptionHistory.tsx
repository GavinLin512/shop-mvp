import React from 'react'
import { StatusBadge } from '../StatusBadge'
import type { MemberSubscription } from '../../types'

interface Props {
  subscriptions: MemberSubscription[]
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}

export function SubscriptionHistory({ subscriptions }: Props) {
  return (
    <div className="sub-panel">
      <h2 className="panel-title">SUBSCRIPTION HISTORY</h2>
      {subscriptions.length === 0 ? (
        <p className="polling-note">No subscription history.</p>
      ) : (
        <table className="history-table">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Status</th>
              <th>Started at</th>
              <th>Cancel at period end</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map(s => (
              <tr key={s.id}>
                <td>{s.planName}</td>
                <td><StatusBadge status={s.status} /></td>
                <td>{formatDate(s.startedAt)}</td>
                <td>{s.cancelAtPeriodEnd ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
