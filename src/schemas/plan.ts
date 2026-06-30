import { z } from 'zod'
import { isValidCurrency } from '../lib/money'

export const CreatePlanSchema = z.object({
  name: z.string().min(1),
  // 最小單位整數，必須為正整數（DECISION #4）
  amount: z.number().int().positive(),
  currency: z.string().refine(isValidCurrency, 'Unsupported currency'),
  intervalDays: z.number().int().positive(),
})
