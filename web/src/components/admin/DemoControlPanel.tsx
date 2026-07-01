import React, { useEffect, useState } from 'react'
import {
  demoReset,
  demoRunBilling,
  demoGetForceFail,
  demoSetForceFail,
  demoReplayWebhook,
  demoGetProvider,
  demoSetProvider,
} from '../../api/client'
import { useConfig } from '../../lib/ConfigContext'

export function DemoControlPanel() {
  const { provider, refetchConfig } = useConfig()
  const [resetInput, setResetInput] = useState('')
  const [resetStatus, setResetStatus] = useState<string | null>(null)
  const [billingResult, setBillingResult] = useState<string | null>(null)
  const [forceFail, setForceFail] = useState(false)
  const [replayResult, setReplayResult] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  /** 當下切換 UI 的狀態：current provider、stripeConfigured */
  const [providerState, setProviderState] = useState<{ current: string; stripeConfigured: boolean } | null>(null)
  const [providerStatus, setProviderStatus] = useState<string | null>(null)

  // 掛載時讀 /demo/provider 還原當下選擇
  useEffect(() => {
    demoGetProvider()
      .then(setProviderState)
      .catch(() => { /* 靜默忽略（非 ADMIN 或 DEMO_MODE 關閉時正常） */ })
  }, [])

  // reload 後從後端讀回 force-fail 真實狀態，避免開關顯示 OFF 但實際仍 ON（狀態不同步）。
  useEffect(() => {
    if (provider !== 'mock') return
    demoGetForceFail()
      .then(({ enabled }) => setForceFail(enabled))
      .catch(() => { /* 靜默忽略，維持預設 OFF */ })
  }, [provider])

  const handleReset = async () => {
    if (resetInput !== 'RESET') return
    setLoading('reset')
    setResetStatus(null)
    try {
      await demoReset()
      setResetStatus('Reset complete.')
      setResetInput('')
    } catch (err) {
      setResetStatus(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setLoading(null)
    }
  }

  const handleRunBilling = async () => {
    setLoading('billing')
    setBillingResult(null)
    try {
      const { processed, skipped } = await demoRunBilling()
      setBillingResult(`processed=${processed} skipped=${skipped}`)
    } catch (err) {
      setBillingResult(err instanceof Error ? err.message : 'Billing failed')
    } finally {
      setLoading(null)
    }
  }

  const handleToggleForceFail = async () => {
    const next = !forceFail
    setLoading('forceFail')
    try {
      await demoSetForceFail(next)
      setForceFail(next)
    } catch {
      // ignore
    } finally {
      setLoading(null)
    }
  }

  const handleReplay = async () => {
    setLoading('replay')
    setReplayResult(null)
    try {
      const { duplicate } = await demoReplayWebhook()
      setReplayResult(duplicate ? 'duplicate: true (ignored, idempotent)' : 'duplicate: false (applied)')
    } catch (err) {
      setReplayResult(err instanceof Error ? err.message : 'Replay failed')
    } finally {
      setLoading(null)
    }
  }

  const handleSwitchProvider = async (target: 'mock' | 'stripe') => {
    setLoading(`provider-${target}`)
    setProviderStatus(null)
    try {
      const result = await demoSetProvider(target)
      setProviderState(prev => prev ? { ...prev, current: result.current } : null)
      setProviderStatus(`Switched to ${result.current}`)
      // 切換後 refetch /config，讓 publishableKey / provider 即時生效（ADR-0013）
      await refetchConfig()
    } catch (err) {
      setProviderStatus(err instanceof Error ? err.message : 'Switch failed')
    } finally {
      setLoading(null)
    }
  }

  return (
    <section className="admin-section" style={{ marginBottom: '2rem', border: '1px solid #ff4444', padding: '1.5rem' }}>
      <h2 className="admin-section-title" style={{ color: '#ff4444' }}>DEMO CONTROL</h2>
      <p className="polling-note" style={{ marginBottom: '1rem' }}>
        DEMO_MODE only — these operations are destructive and not for production.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Provider 切換（ADR-0013）*/}
        {providerState !== null && (
          <div>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '0.85rem', letterSpacing: '0.1em' }}>PAYMENT PROVIDER</h3>
            <p className="polling-note">Current: <strong>{providerState.current.toUpperCase()}</strong></p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                className="btn-ghost"
                disabled={providerState.current === 'mock' || loading === 'provider-mock'}
                onClick={() => handleSwitchProvider('mock')}
              >
                {loading === 'provider-mock' ? 'SWITCHING...' : 'USE MOCK'}
              </button>
              <button
                className="btn-ghost"
                disabled={
                  providerState.current === 'stripe' ||
                  !providerState.stripeConfigured ||
                  loading === 'provider-stripe'
                }
                title={!providerState.stripeConfigured ? 'Requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET' : undefined}
                onClick={() => handleSwitchProvider('stripe')}
              >
                {loading === 'provider-stripe' ? 'SWITCHING...' : 'USE STRIPE'}
              </button>
              {!providerState.stripeConfigured && (
                <span className="polling-note" style={{ alignSelf: 'center', marginLeft: '0.5rem' }}>
                  Stripe not configured — set STRIPE_SECRET_KEY &amp; STRIPE_WEBHOOK_SECRET
                </span>
              )}
            </div>
            {providerStatus && <p className="polling-note" style={{ marginTop: '0.4rem' }}>{providerStatus}</p>}
          </div>
        )}

        {/* Reset */}
        <div>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '0.85rem', letterSpacing: '0.1em' }}>RESET DEMO DATA</h3>
          <p className="polling-note">Deletes all subscriptions, orders, payments, and non-seed members/plans.</p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
            <input
              value={resetInput}
              onChange={e => setResetInput(e.target.value)}
              placeholder='Type RESET to confirm'
              style={{ padding: '0.4rem 0.6rem', background: '#111', border: '1px solid #444', color: '#eee', fontFamily: 'monospace' }}
            />
            <button
              className="btn-ghost cancel-btn"
              disabled={resetInput !== 'RESET' || loading === 'reset'}
              onClick={handleReset}
            >
              {loading === 'reset' ? 'RESETTING...' : 'RESET'}
            </button>
          </div>
          {resetStatus && <p className="polling-note" style={{ marginTop: '0.4rem' }}>{resetStatus}</p>}
        </div>

        {/* Run billing */}
        <div>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '0.85rem', letterSpacing: '0.1em' }}>RUN BILLING NOW</h3>
          <p className="polling-note">Runs billing cycle immediately for all due subscriptions.</p>
          <button
            className="btn-ghost"
            style={{ marginTop: '0.5rem' }}
            disabled={loading === 'billing'}
            onClick={handleRunBilling}
          >
            {loading === 'billing' ? 'RUNNING...' : 'RUN BILLING'}
          </button>
          {billingResult && <p className="polling-note" style={{ marginTop: '0.4rem' }}>{billingResult}</p>}
        </div>

        {/* force-fail / replay — Mock only */}
        {provider === 'mock' ? (
          <>
            <div>
              <h3 style={{ marginBottom: '0.5rem', fontSize: '0.85rem', letterSpacing: '0.1em' }}>FORCE-FAIL (MOCK)</h3>
              <p className="polling-note">ON = all charges return FAILED. Demonstrates dunning paths (#5).</p>
              <button
                className="btn-ghost"
                style={{ marginTop: '0.5rem', color: forceFail ? '#ff4444' : undefined }}
                disabled={loading === 'forceFail'}
                onClick={handleToggleForceFail}
              >
                {loading === 'forceFail' ? 'UPDATING...' : forceFail ? 'FORCE-FAIL: ON (click to turn OFF)' : 'FORCE-FAIL: OFF (click to turn ON)'}
              </button>
            </div>

            <div>
              <h3 style={{ marginBottom: '0.5rem', fontSize: '0.85rem', letterSpacing: '0.1em' }}>REPLAY LAST WEBHOOK (MOCK)</h3>
              <p className="polling-note">Re-sends last webhook to demonstrate idempotency (#1/#2).</p>
              <button
                className="btn-ghost"
                style={{ marginTop: '0.5rem' }}
                disabled={loading === 'replay'}
                onClick={handleReplay}
              >
                {loading === 'replay' ? 'REPLAYING...' : 'REPLAY WEBHOOK'}
              </button>
              {replayResult && <p className="polling-note" style={{ marginTop: '0.4rem' }}>{replayResult}</p>}
            </div>
          </>
        ) : (
          <p className="polling-note">
            force-fail and webhook replay are not available for Stripe. Use test card <code>4000002500003155</code> to trigger failures.
          </p>
        )}
      </div>
    </section>
  )
}
