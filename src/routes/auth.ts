import { Router } from 'express'
import * as z from 'zod'
import { authService } from '../services/authService'
import { AppError } from '../lib/errors'

const router = Router()

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
})

router.post('/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: z.flattenError(parsed.error) })
    return
  }

  const result = await authService.register(parsed.data)
  res.status(201).json(result)
})

export default router
