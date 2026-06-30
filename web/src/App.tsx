import React from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Header } from './components/Header'
import { LoginForm } from './components/LoginForm'
import { MemberView } from './views/MemberView'
import { AdminView } from './views/AdminView'

function AppContent() {
  const { token, role } = useAuth()

  if (!token) return <LoginForm />

  return (
    <>
      {role === 'USER' && <MemberView />}
      {role === 'ADMIN' && <AdminView />}
    </>
  )
}

export function App() {
  return (
    <AuthProvider>
      <Header />
      <AppContent />
    </AuthProvider>
  )
}
