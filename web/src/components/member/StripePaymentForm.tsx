import React, { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useConfig } from '../../lib/ConfigContext'
import type { Subscription } from '../../types'

interface FormProps {
  clientSecret: string
  subscription: Subscription
  onSuccess: (sub: Subscription) => void
}

function CheckoutForm({ clientSecret, subscription, onSuccess }: FormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const { demoMode } = useConfig()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    setError(null)

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      // redirect:'if_required' 搭配 allow_redirects:'never'，不跳轉（ADR-0011）
      redirect: 'if_required',
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed')
      setLoading(false)
      return
    }

    // confirm 成功後進輪詢，等 webhook 轉 ACTIVE（ADR-0013）
    setLoading(false)
    onSuccess(subscription)
  }

  // demo 專用：PaymentElement 是跨來源 iframe，外部 JS 無法填入卡號（PCI 設計），
  // 故改用 Stripe 內建測試 PaymentMethod pm_card_visa（4242，免 3DS）直接 confirm，略過手動輸入。
  const handleAutofill = async () => {
    if (!stripe) return

    setLoading(true)
    setError(null)

    const { error: stripeError } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: 'pm_card_visa',
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed')
      setLoading(false)
      return
    }

    setLoading(false)
    onSuccess(subscription)
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
      <PaymentElement />
      {error && <p style={{ color: '#ff4444', marginTop: '0.5rem', fontSize: '0.85rem' }}>{error}</p>}
      <button
        type="submit"
        className="btn-ghost"
        disabled={!stripe || loading}
        style={{ marginTop: '1rem' }}
      >
        {loading ? 'PROCESSING...' : 'CONFIRM PAYMENT'}
      </button>
      {/* demo-only：一鍵用測試卡 4242 完成付款，正式環境（demoMode=false）不顯示 */}
      {demoMode && (
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #333' }}>
          <p style={{ fontSize: '0.75rem', color: '#888', margin: '0 0 0.5rem' }}>DEMO SHORTCUT</p>
          <button
            type="button"
            className="btn-ghost"
            onClick={handleAutofill}
            disabled={!stripe || loading}
          >
            {loading ? 'PROCESSING...' : 'USE TEST CARD (4242)'}
          </button>
        </div>
      )}
    </form>
  )
}

interface StripePaymentFormProps {
  clientSecret: string
  publishableKey: string
  subscription: Subscription
  onSuccess: (sub: Subscription) => void
}

export function StripePaymentForm({ clientSecret, publishableKey, subscription, onSuccess }: StripePaymentFormProps) {
  const stripePromise = loadStripe(publishableKey)

  return (
    <div className="sub-panel" style={{ marginTop: '1.5rem' }}>
      <h2 className="panel-title">PAYMENT DETAILS</h2>
      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <CheckoutForm clientSecret={clientSecret} subscription={subscription} onSuccess={onSuccess} />
      </Elements>
    </div>
  )
}
