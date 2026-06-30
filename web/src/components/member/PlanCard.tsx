import React from 'react'
import { formatCurrency } from '../../lib/money'
import type { Plan } from '../../types'

interface Props {
  plan: Plan
  onSubscribe: (plan: Plan) => void
  subscribing: boolean
  isCurrent?: boolean
  isRecommended?: boolean
}

export function PlanCard({ plan, onSubscribe, subscribing, isCurrent, isRecommended }: Props) {
  const cardClass = [
    'plan-card',
    isCurrent ? 'plan-card--current' : '',
    isRecommended ? 'plan-card--recommended' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cardClass}>
      {isCurrent && <span className="plan-badge plan-badge--current">YOUR PLAN</span>}
      <div className="plan-name-row">
        <h2 className="plan-name">{plan.name.toUpperCase()}</h2>
        {isRecommended && <span className="plan-badge plan-badge--recommended">RECOMMENDED</span>}
      </div>
      <p className="plan-price">{formatCurrency(plan.amount, plan.currency)}</p>
      <p className="plan-interval">
        every {plan.intervalDays} day{plan.intervalDays !== 1 ? 's' : ''}
      </p>
      <button
        className="btn-primary plan-cta"
        onClick={() => onSubscribe(plan)}
        disabled={subscribing || isCurrent}
      >
        {isCurrent ? 'CURRENT PLAN' : subscribing ? 'SUBSCRIBING...' : 'SUBSCRIBE'}
      </button>
    </div>
  )
}
