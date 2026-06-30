import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import http from 'http'
import type { AddressInfo } from 'net'
import crypto from 'crypto'
import { createApp } from '../src/app'
import { resetStore, setForceFail } from '../src/routes/mockGateway'

const app = createApp()

beforeEach(() => {
  resetStore()
})

const baseCharge = {
  orderId: 'ord_test',
  amount: 1000,
  currency: 'TWD',
  idempotencyKey: 'key_gw_1',
}

/**
 * 啟動捕獲伺服器並在其 listen 後執行 charge 請求，
 * 回傳 Promise<{port, headers, body}>，resolve 於 callback 到達時。
 */
function captureCallback(chargeBody: object): Promise<{ headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise<{ headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const captureServer = http.createServer((req, res) => {
      let body = ''
      req.on('data', c => (body += c))
      req.on('end', () => {
        res.writeHead(200).end()
        captureServer.close()
        resolve({ headers: req.headers, body })
      })
    })

    captureServer.listen(0, () => {
      const port = (captureServer.address() as AddressInfo).port

      // 傳入 _callbackUrl 讓 mock-gateway 打到捕獲伺服器
      request(app)
        .post('/mock-gateway/charge')
        .send({ ...chargeBody, _callbackUrl: `http://localhost:${port}` })
        .then(() => {})
        .catch(reject)
    })
  })
}

describe('09-mock-gateway', () => {
  describe('1. 收單回 txnId + PENDING [tracer bullet]', () => {
    it('POST /mock-gateway/charge → {txnId, status:"PENDING"}', async () => {
      const res = await request(app)
        .post('/mock-gateway/charge')
        .send(baseCharge)

      expect(res.status).toBe(200)
      expect(res.body.txnId).toMatch(/^txn_/)
      expect(res.body.status).toBe('PENDING')
    })
  })

  describe('2. callback 帶有效 HMAC 打 webhook', () => {
    it('X-Signature = HMAC-SHA256(rawBody, WEBHOOK_SECRET)', async () => {
      const { headers, body } = await captureCallback(baseCharge)

      const expected = crypto
        .createHmac('sha256', process.env.WEBHOOK_SECRET!)
        .update(body)
        .digest('hex')

      expect(headers['x-signature']).toBe(expected)
    })
  })

  describe('3. 查詢 API 回交易狀態', () => {
    it('GET /mock-gateway/charge/:txnId 回 txn 資訊', async () => {
      const chargeRes = await request(app)
        .post('/mock-gateway/charge')
        .send(baseCharge)

      const { txnId } = chargeRes.body

      const queryRes = await request(app).get(`/mock-gateway/charge/${txnId}`)

      expect(queryRes.status).toBe(200)
      expect(queryRes.body.txnId).toBe(txnId)
      expect(queryRes.body.amount).toBe(baseCharge.amount)
      expect(queryRes.body.currency).toBe(baseCharge.currency)
    })
  })

  describe('4. 成敗可控（force-fail 全域旗標）', () => {
    it('forceFail=false → callback status=SUCCESS', async () => {
      const { body } = await captureCallback(baseCharge)
      expect(JSON.parse(body).status).toBe('SUCCESS')
    })

    it('forceFail=true → callback status=FAILED（ADR-0012）', async () => {
      setForceFail(true)
      const { body } = await captureCallback(baseCharge)
      expect(JSON.parse(body).status).toBe('FAILED')
    })
  })
})
