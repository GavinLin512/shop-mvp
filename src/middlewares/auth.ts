import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AppError } from '../lib/errors'

/**
 * authn：驗 Bearer JWT，成功後將 { id, role } 掛到 req.member。
 * 未帶 / 格式錯 / 簽章錯 / 過期 → 401（未認證）。
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    next(new AppError(401, 'Unauthorized'))
    return
  }

  const token = authHeader.slice(7)
  const secret = process.env.JWT_SECRET
  if (!secret) {
    next(new Error('JWT_SECRET is not set'))
    return
  }

  try {
    const payload = jwt.verify(token, secret) as { sub: string; role: string }
    req.member = { id: payload.sub, role: payload.role }
    next()
  } catch {
    // jwt 驗證失敗（竄改 / 過期 / 格式錯）一律 401
    next(new AppError(401, 'Unauthorized'))
  }
}

/**
 * authz：必須在 requireAuth 之後使用。
 * req.member.role 不符合所需角色 → 403（已認證、無權限）。
 */
export function requireRole(role: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.member?.role !== role) {
      next(new AppError(403, 'Forbidden'))
      return
    }
    next()
  }
}
