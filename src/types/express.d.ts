declare global {
  namespace Express {
    interface Request {
      member?: {
        id: string
        role: string
      }
    }
  }
}

export {}
