import prisma from '../lib/prisma'

type CreatePlanInput = {
  name: string
  amount: number
  currency: string
  intervalDays: number
}

export const planRepo = {
  async create(data: CreatePlanInput) {
    return prisma.plan.create({ data })
  },

  async findAllActive() {
    return prisma.plan.findMany({
      where: { active: true },
      select: { id: true, name: true, amount: true, currency: true, intervalDays: true },
    })
  },
}
