import React, { useState } from 'react'
import { CreatePlanForm } from '../components/admin/CreatePlanForm'
import { PlanLookup } from '../components/admin/PlanLookup'

export function AdminView() {
  const [planRefreshKey, setPlanRefreshKey] = useState(0)

  return (
    <main className="main-content">
      <h1 className="section-title">
        ADMIN <span className="accent">PANEL</span>
      </h1>
      <div className="admin-grid">
        <section className="admin-section">
          <h2 className="admin-section-title">CREATE PLAN</h2>
          <CreatePlanForm onCreated={() => setPlanRefreshKey(k => k + 1)} />
        </section>
        <section className="admin-section">
          <h2 className="admin-section-title">LOOKUP PLAN</h2>
          <PlanLookup refreshKey={planRefreshKey} />
        </section>
      </div>
    </main>
  )
}
