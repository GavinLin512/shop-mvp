import React from 'react'
import { useAuth } from '../auth/AuthContext'

export function Header() {
  const { role, logout, token } = useAuth()

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-logo">
          <span className="logo-mark">S</span>
          <span className="logo-name">SHOP MVP</span>
        </div>
        <div className="header-actions">
          {token ? (
            <>
              <span className="role-chip">{role}</span>
              <button className="btn-ghost" onClick={logout}>SIGN OUT</button>
            </>
          ) : (
            <span className="header-hint">Sign in below</span>
          )}
        </div>
      </div>
    </header>
  )
}
