import React, { useState } from 'react'
import { CreatePlanForm } from '../components/admin/CreatePlanForm'
import { PlanLookup } from '../components/admin/PlanLookup'
import { AdminSubscriptionList } from '../components/admin/AdminSubscriptionList'

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
      <section className="admin-section" style={{ marginTop: '2rem' }}>
        <h2 className="admin-section-title">SUBSCRIPTIONS</h2>
        <AdminSubscriptionList />
      </section>
    </main>
  )
}
