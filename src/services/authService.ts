import bcrypt from 'bcryptjs'
import { Prisma } from '../generated/prisma/client'
import { AppError } from '../lib/errors'
import { memberRepo } from '../repositories/memberRepo'

type RegisterInput = {
  email: string
  password: string
}

// 回傳欄位不含 passwordHash，避免外洩
type RegisterResult = {
  id: string
  email: string
  role: string
  tier: string
  createdAt: Date
}

export const authService = {
  async register({ email, password }: RegisterInput): Promise<RegisterResult> {
    const passwordHash = await bcrypt.hash(password, 10)

    try {
      const member = await memberRepo.create({ email, passwordHash })
      return {
        id: member.id,
        email: member.email,
        role: member.role,
        tier: member.tier,
        createdAt: member.createdAt,
      }
    } catch (err) {
      // Prisma unique constraint violation → 重複 email
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new AppError(409, 'Email already registered')
      }
      throw err
    }
  },
}
