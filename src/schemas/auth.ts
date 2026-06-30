import { z } from 'zod'

export const RegisterSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
})

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})
