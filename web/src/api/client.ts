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
    const err = new Error((body as { error?: string }).error ?? 'Request failed') as Error & { status: number }
    err.status = res.status
    throw err
  }

  return res.json() as Promise<T>
}
