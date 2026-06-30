import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import * as z from 'zod'

// 必須在任何 .openapi() 呼叫之前執行（DECISION #4 schema 共用）
extendZodWithOpenApi(z)

export const registry = new OpenAPIRegistry()

// --- Security scheme ---
const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
})

// --- Request schemas ---

const RegisterReqSchema = registry.register(
  'RegisterRequest',
  z.object({
    email: z.email(),
    password: z.string().min(8),
  }).openapi('RegisterRequest'),
)

const LoginReqSchema = registry.register(
  'LoginRequest',
  z.object({
    email: z.email(),
    password: z.string().min(1),
  }).openapi('LoginRequest'),
)

const CreatePlanReqSchema = registry.register(
  'CreatePlanRequest',
  z.object({
    name: z.string().min(1),
    amount: z.number().int().positive().openapi({ description: 'Amount in minor currency units (e.g., 999 = $9.99 USD). DECISION #4.' }),
    currency: z.string().openapi({ description: 'ISO 4217 currency code (USD, TWD, JPY)' }),
    intervalDays: z.number().int().positive(),
  }).openapi('CreatePlanRequest'),
)

const CreateSubscriptionReqSchema = registry.register(
  'CreateSubscriptionRequest',
  z.object({
    planId: z.string(),
  }).openapi('CreateSubscriptionRequest'),
)

const ChargeReqSchema = registry.register(
  'ChargeRequest',
  z.object({
    orderId: z.string(),
  }).openapi('ChargeRequest'),
)

// --- Response schemas ---

const MemberSchema = registry.register(
  'Member',
  z.object({
    id: z.string(),
    email: z.email(),
    role: z.enum(['USER', 'ADMIN']),
    tier: z.enum(['NORMAL', 'VIP']),
    createdAt: z.iso.datetime(),
  }).openapi('Member'),
)

const LoginResponseSchema = registry.register(
  'LoginResponse',
  z.object({
    token: z.string(),
  }).openapi('LoginResponse'),
)

const PlanSchema = registry.register(
  'Plan',
  z.object({
    id: z.string(),
    name: z.string(),
    amount: z.number().int().openapi({ description: 'Amount in minor currency units. DECISION #4.' }),
    currency: z.string().openapi({ description: 'ISO 4217 currency code' }),
    intervalDays: z.number().int(),
    active: z.boolean(),
  }).openapi('Plan'),
)

const SubscriptionSchema = registry.register(
  'Subscription',
  z.object({
    id: z.string(),
    memberId: z.string(),
    planId: z.string(),
    status: z.enum(['INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'CANCELED']),
    retryCount: z.number().int(),
    cancelAtPeriodEnd: z.boolean(),
    nextBillingDate: z.iso.datetime(),
    startedAt: z.iso.datetime(),
    canceledAt: z.iso.datetime().nullable(),
  }).openapi('Subscription'),
)

const ChargeResponseSchema = registry.register(
  'ChargeResponse',
  z.object({
    providerTxnId: z.string(),
  }).openapi('ChargeResponse'),
)

const ErrorSchema = registry.register(
  'Error',
  z.object({
    error: z.string(),
  }).openapi('Error'),
)

const HealthSchema = registry.register(
  'Health',
  z.object({
    status: z.string(),
  }).openapi('Health'),
)

// --- Path registrations ---

registry.registerPath({
  method: 'get',
  path: '/health',
  summary: 'Health check',
  tags: ['System'],
  responses: {
    200: {
      description: 'Server is healthy',
      content: { 'application/json': { schema: HealthSchema } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/auth/register',
  summary: 'Register a new member',
  tags: ['Auth'],
  request: {
    body: {
      content: { 'application/json': { schema: RegisterReqSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Member registered',
      content: { 'application/json': { schema: MemberSchema } },
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorSchema } } },
    409: { description: 'Email already registered', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/auth/login',
  summary: 'Login and get JWT token',
  tags: ['Auth'],
  request: {
    body: {
      content: { 'application/json': { schema: LoginReqSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'JWT token',
      content: { 'application/json': { schema: LoginResponseSchema } },
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorSchema } } },
    401: { description: 'Invalid credentials', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'get',
  path: '/plans',
  summary: 'List all active plans',
  tags: ['Plans'],
  responses: {
    200: {
      description: 'List of active plans',
      content: { 'application/json': { schema: z.array(PlanSchema) } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/plans',
  summary: 'Create a new plan (ADMIN only)',
  tags: ['Plans'],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    body: {
      content: { 'application/json': { schema: CreatePlanReqSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Plan created',
      content: { 'application/json': { schema: PlanSchema } },
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/subscriptions',
  summary: 'Create a subscription (INCOMPLETE until webhook confirms payment)',
  tags: ['Subscriptions'],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    body: {
      content: { 'application/json': { schema: CreateSubscriptionReqSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Subscription created (INCOMPLETE)',
      content: { 'application/json': { schema: SubscriptionSchema } },
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'get',
  path: '/subscriptions/{id}',
  summary: 'Get subscription by ID (owner or ADMIN)',
  tags: ['Subscriptions'],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: 'Subscription',
      content: { 'application/json': { schema: SubscriptionSchema } },
    },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorSchema } } },
    404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/subscriptions/{id}/cancel',
  summary: 'Cancel subscription at period end (idempotent, DECISION #9)',
  tags: ['Subscriptions'],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: 'Subscription with cancelAtPeriodEnd=true',
      content: { 'application/json': { schema: SubscriptionSchema } },
    },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorSchema } } },
    404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/payments/charge',
  summary: 'Charge an order via payment provider',
  tags: ['Payments'],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    body: {
      content: { 'application/json': { schema: ChargeReqSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Charge initiated',
      content: { 'application/json': { schema: ChargeResponseSchema } },
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
    404: { description: 'Order not found', content: { 'application/json': { schema: ErrorSchema } } },
  },
})
