import { z } from 'zod'

export const CreateSubscriptionSchema = z.object({
  planId: z.string(),
})
