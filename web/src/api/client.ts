import type { MemberSubscription, AdminSubscription } from '../types'

// Bearer token 由 AuthContext 在 login/logout 時同步更新
let _token: string | null = typeof window !== 'undefined'
  ? sessionStorage.getItem('token')
  : null

export function setAuthToken(token: string | null) {
  _token = token
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (_token) headers['Authorization'] = `Bearer ${_token}`

  const res = await fetch(`/api${path}`, { ...init, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
  
    let message = 'Request failed'
  
    if (typeof body?.error === 'string') {
      message = body.error
    } else if (body?.error && typeof body.error === 'object') {
      message =
        body.error.formErrors?.[0] ??
        Object.values(body.error.fieldErrors ?? {})
          .flat()
          .join('\n') ??
        res.statusText
    } else {
      message = res.statusText
    }
  
    const err = new Error(message) as Error & {
      status: number
      body?: typeof body
    }
  
    err.status = res.status
    err.body = body
  
    throw err
  }

  return res.json() as Promise<T>
}

// 本人訂閱清單（依 startedAt 新→舊，後端已排序）
export function listSubscriptions(): Promise<MemberSubscription[]> {
  return apiFetch<MemberSubscription[]>('/subscriptions')
}

// 全部訂閱清單（ADMIN 專用）
export function listAllSubscriptions(): Promise<AdminSubscription[]> {
  return apiFetch<AdminSubscription[]>('/admin/subscriptions')
}
