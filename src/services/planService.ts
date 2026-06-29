import { planRepo } from '../repositories/planRepo'

type CreatePlanInput = {
  name: string
  amount: number
  currency: string
  intervalDays: number
}

export const planService = {
  async create(data: CreatePlanInput) {
    return planRepo.create(data)
  },

  async listActive() {
    return planRepo.findAllActive()
  },
}
