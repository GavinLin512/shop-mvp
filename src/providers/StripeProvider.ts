import Stripe from 'stripe'
import type { PaymentProvider, ChargeInput, ChargeResult } from './PaymentProvider'
import prisma from '../lib/prisma'

/**
 * 最小化 Stripe client 介面，讓測試可注入 stub 而不須引入完整 Stripe 型別。
 * 測試 cast: `stub as unknown as StripeClient`
 */
export interface StripeClient {
  customers: {
    create(
      params: { email: string },
      options?: { idempotencyKey?: string },
    ): Promise<{ id: string }>
  }
  paymentIntents: {
    create(
      params: Stripe.PaymentIntentCreateParams,
      options?: { idempotencyKey?: string },
    ): Promise<{ id: string; client_secret: string | null; status: string }>
  }
}

/**
 * StripeProvider — 實作 PaymentProvider adapter（ADR-0011）。
 *
 * 首期（尚無存卡）：
 *   建 Stripe Customer（若未建）+ PaymentIntent(setup_future_usage:'off_session')。
 *   回 { status:'PENDING', clientSecret } — 等前端 confirm + webhook 補正。
 *
 * 續扣（已有存卡）：
 *   用 off_session:true, confirm:true + customer + payment_method 同步扣款。
 *   成功同步回 { status:'SUCCESS' }；StripeCardError 映成 { status:'FAILED' }。
 *   billing/dunning 當場判定，不等 webhook（webhook 只作對帳備援, DECISION.md #3）。
 */
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe'
  private readonly _injected?: StripeClient
  private _lazy?: StripeClient

  /**
   * stripeClient 由外部注入（測試 stub）；未提供時 lazy 建真實 client，
   * 缺金鑰時不在 boot 擲錯，只在 charge() 真正被呼叫時才失敗（ADR-0013）。
   */
  constructor(stripeClient?: StripeClient) {
    this._injected = stripeClient
  }

  private get stripe(): StripeClient {
    if (this._injected) return this._injected
    if (!this._lazy) {
      this._lazy = new Stripe(process.env.STRIPE_SECRET_KEY!) as unknown as StripeClient
    }
    return this._lazy
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const { orderId, amount, currency, idempotencyKey } = input

    // 讀 DB 取得 member 與 subscription，判斷走首期還是 off-session 續扣
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { member: true, subscription: true },
    })

    const hasStoredCard =
      !!order.member.providerCustomerId && !!order.subscription?.providerPaymentMethodId

    if (hasStoredCard) {
      return this.chargeOffSession({
        customerId: order.member.providerCustomerId!,
        paymentMethodId: order.subscription!.providerPaymentMethodId!,
        amount,
        currency,
        idempotencyKey,
      })
    }

    return this.chargeFirst({
      orderId,
      memberId: order.member.id,
      email: order.member.email,
      existingCustomerId: order.member.providerCustomerId ?? null,
      amount,
      currency,
      idempotencyKey,
    })
  }

  /** 首期：建 Customer（若未建）+ PaymentIntent(setup_future_usage:'off_session')。 */
  private async chargeFirst(params: {
    orderId: string
    memberId: string
    email: string
    existingCustomerId: string | null
    amount: number
    currency: string
    idempotencyKey: string
  }): Promise<ChargeResult> {
    let customerId = params.existingCustomerId
    if (!customerId) {
      const customer = await this.stripe.customers.create(
        { email: params.email },
        { idempotencyKey: `${params.idempotencyKey}:customer` },
      )
      customerId = customer.id
      // 存回 DB，讓續扣可以找到 Customer
      await prisma.member.update({
        where: { id: params.memberId },
        data: { providerCustomerId: customerId },
      })
    }

    const pi = await this.stripe.paymentIntents.create(
      {
        amount: params.amount,
        currency: params.currency.toLowerCase(),
        customer: customerId,
        setup_future_usage: 'off_session',
        // 只收不跳轉的付款方式（卡），排除 redirect-based methods，
        // confirm 時免帶 return_url（否則 Stripe 預設啟用 Dashboard 全部方式而要求 return_url）
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        // 把內部 orderId 寫進 metadata，讓 /webhooks/stripe 能由 PI 反查 Order
        // （首扣此時尚未建 Payment，無法靠 providerTxnId 反查，ADR-0011 webhook 補正）
        metadata: { orderId: params.orderId },
      },
      { idempotencyKey: params.idempotencyKey },
    )

    return { providerTxnId: pi.id, status: 'PENDING', clientSecret: pi.client_secret! }
  }

  /**
   * 續扣：off_session + confirm + customer + payment_method（Stripe 規定一起帶）。
   * 成功同步回 SUCCESS；StripeCardError 映成 FAILED，不擲出未捕捉例外。
   */
  private async chargeOffSession(params: {
    customerId: string
    paymentMethodId: string
    amount: number
    currency: string
    idempotencyKey: string
  }): Promise<ChargeResult> {
    try {
      const pi = await this.stripe.paymentIntents.create(
        {
          amount: params.amount,
          currency: params.currency.toLowerCase(),
          customer: params.customerId,
          payment_method: params.paymentMethodId,
          off_session: true,
          confirm: true,
        },
        { idempotencyKey: params.idempotencyKey },
      )
      return { providerTxnId: pi.id, status: 'SUCCESS' }
    } catch (err) {
      // StripeCardError：authentication_required / decline — 當一般失敗走 dunning
      if (err instanceof Stripe.errors.StripeCardError) {
        const raw = err.raw as { payment_intent?: { id: string } } | undefined
        return {
          providerTxnId: raw?.payment_intent?.id ?? params.idempotencyKey,
          status: 'FAILED',
        }
      }
      throw err
    }
  }
}
