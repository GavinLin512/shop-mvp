import { Router } from 'express'
import * as z from 'zod'
import { authService } from '../services/authService'
import { RegisterSchema, LoginSchema } from '../schemas/auth'

const router: Router = Router()

router.post('/auth/register', async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: z.flattenError(parsed.error) })
    return
  }

  const result = await authService.register(parsed.data)
  res.status(201).json(result)
})

router.post('/auth/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: z.flattenError(parsed.error) })
    return
  }

  const result = await authService.login(parsed.data)
  res.status(200).json(result)
})

export default router
