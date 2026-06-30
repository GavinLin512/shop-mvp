import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import { registry } from './registry'

const generator = new OpenApiGeneratorV31(registry.definitions)

// 型別標注為 object，避免 TS 對 openapi3-ts 深層型別的可攜性警告
export const openapiDocument: object = generator.generateDocument({
  openapi: '3.1.0',
  info: {
    title: 'shop-mvp',
    version: '1.0.0',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local dev server' }],
})
