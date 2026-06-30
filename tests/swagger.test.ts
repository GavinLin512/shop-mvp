import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'

const app = createApp()

describe('16-swagger', () => {
  describe('1. GET /api-docs/openapi.json 回 200 且為合法 OpenAPI 3.1', () => {
    it('回 200，body 有 openapi/info/paths 欄位', async () => {
      const res = await request(app).get('/api-docs/openapi.json')

      expect(res.status).toBe(200)
      expect(res.body.openapi).toMatch(/^3\.1/)
      expect(res.body.info).toBeDefined()
      expect(res.body.info.title).toBeDefined()
      expect(res.body.info.version).toBeDefined()
      expect(res.body.paths).toBeDefined()
    })
  })

  describe('2. spec 含全部 9 條對外路徑', () => {
    it('paths 包含所有必要端點', async () => {
      const res = await request(app).get('/api-docs/openapi.json')
      const paths = res.body.paths as Record<string, unknown>

      expect(paths['/auth/register']).toBeDefined()
      expect(paths['/auth/login']).toBeDefined()
      expect(paths['/plans']).toBeDefined()

      const plans = paths['/plans'] as Record<string, unknown>
      expect(plans['get']).toBeDefined()
      expect(plans['post']).toBeDefined()

      expect(paths['/subscriptions']).toBeDefined()
      expect(paths['/subscriptions/{id}']).toBeDefined()
      expect(paths['/subscriptions/{id}/cancel']).toBeDefined()
      expect(paths['/payments/charge']).toBeDefined()
      expect(paths['/health']).toBeDefined()
    })
  })

  describe('3. spec 不含內部路徑', () => {
    it('paths 不含 /mock-gateway 或 /webhooks 開頭的 key', async () => {
      const res = await request(app).get('/api-docs/openapi.json')
      const paths = Object.keys(res.body.paths as Record<string, unknown>)

      const hasMockGateway = paths.some((p) => p.startsWith('/mock-gateway'))
      const hasWebhooks = paths.some((p) => p.startsWith('/webhooks'))

      expect(hasMockGateway).toBe(false)
      expect(hasWebhooks).toBe(false)
    })
  })

  describe('4. bearerAuth 授權正確', () => {
    it('components.securitySchemes 有 bearerAuth(type:http, scheme:bearer)', async () => {
      const res = await request(app).get('/api-docs/openapi.json')
      const schemes = res.body.components?.securitySchemes as Record<string, { type: string; scheme: string }>

      expect(schemes).toBeDefined()
      expect(schemes['bearerAuth']).toBeDefined()
      expect(schemes['bearerAuth'].type).toBe('http')
      expect(schemes['bearerAuth'].scheme).toBe('bearer')
    })

    it('POST /subscriptions 帶 bearerAuth security', async () => {
      const res = await request(app).get('/api-docs/openapi.json')
      const paths = res.body.paths as Record<string, Record<string, { security?: unknown[] }>>
      const security = paths['/subscriptions']?.['post']?.security

      expect(security).toBeDefined()
      expect(Array.isArray(security)).toBe(true)
      expect(JSON.stringify(security)).toContain('bearerAuth')
    })

    it('POST /payments/charge 帶 bearerAuth security', async () => {
      const res = await request(app).get('/api-docs/openapi.json')
      const paths = res.body.paths as Record<string, Record<string, { security?: unknown[] }>>
      const security = paths['/payments/charge']?.['post']?.security

      expect(security).toBeDefined()
      expect(JSON.stringify(security)).toContain('bearerAuth')
    })

    it('POST /plans 帶 bearerAuth security', async () => {
      const res = await request(app).get('/api-docs/openapi.json')
      const paths = res.body.paths as Record<string, Record<string, { security?: unknown[] }>>
      const security = paths['/plans']?.['post']?.security

      expect(security).toBeDefined()
      expect(JSON.stringify(security)).toContain('bearerAuth')
    })

    it('GET /health 不帶 security', async () => {
      const res = await request(app).get('/api-docs/openapi.json')
      const paths = res.body.paths as Record<string, Record<string, { security?: unknown[] }>>
      const security = paths['/health']?.['get']?.security

      expect(security).toBeUndefined()
    })

    it('GET /plans 不帶 security', async () => {
      const res = await request(app).get('/api-docs/openapi.json')
      const paths = res.body.paths as Record<string, Record<string, { security?: unknown[] }>>
      const security = paths['/plans']?.['get']?.security

      expect(security).toBeUndefined()
    })
  })

  describe('5. GET /api-docs/ 回 200 且為 Swagger UI 頁面', () => {
    it('GET /api-docs/ 回 200，content-type html，body 含 swagger-ui', async () => {
      // swagger-ui-express 對 /api-docs 會 301 轉 /api-docs/，直接打 /api-docs/ 避免跟隨 redirect
      const res = await request(app).get('/api-docs/')

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/text\/html/)
      expect(res.text).toContain('swagger-ui')
    })
  })
})
