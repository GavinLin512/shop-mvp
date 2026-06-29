import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
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

type LoginInput = {
  email: string
  password: string
}

type LoginResult = {
  token: string
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

  async login({ email, password }: LoginInput): Promise<LoginResult> {
    const member = await memberRepo.findByEmail(email)

    // 統一用同一訊息，不洩漏帳號是否存在
    const INVALID_CREDENTIALS = 'Invalid email or password'

    if (!member) {
      throw new AppError(401, INVALID_CREDENTIALS)
    }

    const passwordMatch = await bcrypt.compare(password, member.passwordHash)
    if (!passwordMatch) {
      throw new AppError(401, INVALID_CREDENTIALS)
    }

    const secret = process.env.JWT_SECRET
    if (!secret) {
      throw new Error('JWT_SECRET is not set')
    }

    // sub = memberId，role 供後續 RBAC 中介層使用
    const token = jwt.sign(
      { sub: member.id, role: member.role },
      secret,
      { expiresIn: '7d' },
    )

    return { token }
  },
}
