import type { PaymentProvider, ChargeInput, ChargeResult } from './PaymentProvider'

/**
 * 透過 HTTP 呼叫 mock-gateway 的 PaymentProvider 實作。
 * gatewayUrl 可注入，測試時傳入測試伺服器的 baseUrl。
 */
export class MockProvider implements PaymentProvider {
  readonly name = 'mock'
  private readonly gatewayUrl: string

  constructor(gatewayUrl?: string) {
    this.gatewayUrl = gatewayUrl ?? process.env.MOCK_GATEWAY_URL ?? 'http://localhost:3000'
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const res = await fetch(`${this.gatewayUrl}/mock-gateway/charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })

    if (!res.ok) {
      throw new Error(`Mock gateway returned ${res.status}`)
    }

    const { txnId } = (await res.json()) as { txnId: string }
    return { providerTxnId: txnId, status: 'PENDING' }
  }
}
