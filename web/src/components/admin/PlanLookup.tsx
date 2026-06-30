import React, { useState } from 'react'
import { PlanList } from './PlanList'

interface Props {
  refreshKey?: number
}

export function PlanLookup({ refreshKey }: Props) {
  const [query, setQuery] = useState('')

  return (
    <div className="lookup-wrap">
      <input
        className="field-input"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Filter by name..."
      />
      <div style={{ marginTop: '1rem' }}>
        <PlanList refreshKey={refreshKey} nameFilter={query} />
      </div>
    </div>
  )
}
