import React, { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { formatCurrency } from '../../lib/money'
import type { Plan } from '../../types'

interface Props {
  refreshKey?: number
  nameFilter?: string
}

export function PlanList({ refreshKey, nameFilter }: Props) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Plan[]>('/plans')
      .then(setPlans)
      .catch((err: Error) => setError(err.message))
  }, [refreshKey])

  const filtered = nameFilter
    ? plans.filter(p => p.name.toLowerCase().includes(nameFilter.toLowerCase()))
    : plans

  if (error) return <p className="error-text">{error}</p>
  if (filtered.length === 0) return <p className="muted-text">{plans.length === 0 ? 'No plans yet.' : 'No matching plans.'}</p>

  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Price</th>
          <th>Interval</th>
          <th>ID</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map(plan => (
          <tr key={plan.id}>
            <td>{plan.name}</td>
            <td>{formatCurrency(plan.amount, plan.currency)}</td>
            <td>{plan.intervalDays}d</td>
            <td className="muted-text" title={plan.id}>{plan.id.slice(0, 8)}…</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
