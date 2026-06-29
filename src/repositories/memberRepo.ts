import prisma from '../lib/prisma'

type CreateMemberInput = {
  email: string
  passwordHash: string
}

export const memberRepo = {
  async create(data: CreateMemberInput) {
    return prisma.member.create({ data })
  },

  async findByEmail(email: string) {
    return prisma.member.findUnique({ where: { email } })
  },
}
