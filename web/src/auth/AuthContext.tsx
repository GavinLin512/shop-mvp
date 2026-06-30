import React, { createContext, useContext, useState } from 'react'
import { parseJwtPayload, type JwtPayload } from './jwt'
import { setAuthToken } from '../api/client'

interface AuthState {
  token: string | null
  role: JwtPayload['role'] | null
  userId: string | null
}

interface AuthContextValue extends AuthState {
  login: (token: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  role: null,
  userId: null,
  login: () => {},
  logout: () => {},
})

// 同步從 sessionStorage 載入，避免首次渲染閃爍
function loadStoredAuth(): AuthState {
  const token = sessionStorage.getItem('token')
  if (!token) return { token: null, role: null, userId: null }
  try {
    const payload = parseJwtPayload(token)
    setAuthToken(token) // 同步初始化 api client
    return { token, role: payload.role, userId: payload.sub }
  } catch {
    return { token: null, role: null, userId: null }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(loadStoredAuth)

  const login = (token: string) => {
    const payload = parseJwtPayload(token)
    sessionStorage.setItem('token', token)
    setAuthToken(token)
    setState({ token, role: payload.role, userId: payload.sub })
  }

  const logout = () => {
    sessionStorage.removeItem('token')
    setAuthToken(null)
    setState({ token: null, role: null, userId: null })
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
