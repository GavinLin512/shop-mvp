export interface JwtPayload {
  sub: string
  role: 'USER' | 'ADMIN'
  iat?: number
  exp?: number
}

// 只解碼 payload，不驗簽（授權由後端 requireRole 把關，前端只取 role 做 UX 路由）
export function parseJwtPayload(token: string): JwtPayload {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT format')
  // base64url → base64 standard → JSON
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  return JSON.parse(atob(padded)) as JwtPayload
}
