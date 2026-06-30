import React from 'react'

type Status = 'INCOMPLETE' | 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'FAILED' | 'CANCELED'

interface Props {
  status: Status
  cancelAtPeriodEnd?: boolean
}

const STATUS_CLASS: Record<Status, string> = {
  INCOMPLETE: 'badge--pending',
  PENDING:    'badge--pending',
  ACTIVE:     'badge--active',
  PAST_DUE:   'badge--warn',
  FAILED:     'badge--failed',
  CANCELED:   'badge--failed',
}

export function StatusBadge({ status, cancelAtPeriodEnd }: Props) {
  return (
    <span className="badge-wrapper">
      <span className={`badge ${STATUS_CLASS[status] ?? 'badge--pending'}`}>
        {status}
      </span>
      {/* spec 衝突決議 #9：期末取消後 status 維持 ACTIVE，另標記說明 */}
      {cancelAtPeriodEnd && (
        <span className="badge-cancel-note">cancels at period end</span>
      )}
    </span>
  )
}
