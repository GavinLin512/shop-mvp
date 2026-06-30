import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../lib/errors'

/** DEMO_MODE !== 'true' 時回 404，不洩漏端點存在（ADR-0012）。 */
export function requireDemoMode(_req: Request, _res: Response, next: NextFunction): void {
  if (process.env.DEMO_MODE !== 'true') {
    next(new AppError(404, 'Not found'))
    return
  }
  next()
}
