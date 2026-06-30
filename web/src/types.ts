export interface Plan {
  id: string
  name: string
  amount: number
  currency: string
  intervalDays: number
}

export interface Subscription {
  id: string
  status: 'INCOMPLETE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED'
  cancelAtPeriodEnd: boolean
  planId: string
  userId: string
  nextBillingDate?: string
}
