import { z } from 'zod'

export const ChargeSchema = z.object({
  orderId: z.string(),
})
