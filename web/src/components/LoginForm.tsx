import React, { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../api/client'

const DEMO_ACCOUNTS = [
  { label: 'User 1', email: 'user@demo.com',  password: 'demo1234' },
  { label: 'User 2', email: 'user2@demo.com', password: 'demo1234' },
  { label: 'Admin',  email: 'admin@demo.com', password: 'demo1234' },
]

export function LoginForm() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { token } = await apiFetch<{ token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      login(token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1 className="login-title">SIGN IN</h1>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="field-input"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <label className="field-label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="field-input"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'SIGNING IN...' : 'SIGN IN'}
          </button>
        </form>

        <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Quick fill</p>
          {DEMO_ACCOUNTS.map(acc => (
            <button
              key={acc.email}
              type="button"
              className="btn-ghost"
              style={{ width: '100%', fontSize: '0.75rem' }}
              onClick={() => { setEmail(acc.email); setPassword(acc.password) }}
            >
              {acc.label} — {acc.email}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
