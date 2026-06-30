import React, { useState } from 'react'
import { apiFetch } from '../../api/client'
import { formatCurrency } from '../../lib/money'
import type { Plan } from '../../types'

interface Props {
  onCreated?: () => void
}

export function CreatePlanForm({ onCreated }: Props) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [intervalDays, setIntervalDays] = useState('30')
  const [created, setCreated] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const plan = await apiFetch<Plan>('/plans', {
        method: 'POST',
        body: JSON.stringify({
          name,
          amount: parseInt(amount, 10),
          currency,
          intervalDays: parseInt(intervalDays, 10),
        }),
      })
      setCreated(plan)
      setName('')
      setAmount('')
      onCreated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create plan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-form-wrap">
      <form className="admin-form" onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="plan-name">Plan Name</label>
        <input
          id="plan-name"
          className="field-input"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />

        <label className="field-label" htmlFor="plan-amount">Amount (minor unit)</label>
        <input
          id="plan-amount"
          className="field-input"
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="e.g. 999 for $9.99 USD"
          required
        />

        <label className="field-label" htmlFor="plan-currency">Currency</label>
        <select
          id="plan-currency"
          className="field-input"
          value={currency}
          onChange={e => setCurrency(e.target.value)}
        >
          <option value="USD">USD</option>
          <option value="JPY">JPY</option>
          <option value="TWD">TWD</option>
        </select>

        <label className="field-label" htmlFor="plan-interval">Interval (days)</label>
        <input
          id="plan-interval"
          className="field-input"
          type="number"
          value={intervalDays}
          onChange={e => setIntervalDays(e.target.value)}
          required
        />

        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'CREATING...' : 'CREATE PLAN'}
        </button>
      </form>

      {created && (
        <div className="success-card">
          <p className="success-label">Plan created</p>
          <p className="success-name">{created.name}</p>
          <p className="success-price">
            {formatCurrency(created.amount, created.currency)} / {created.intervalDays} days
          </p>
        </div>
      )}
    </div>
  )
}
