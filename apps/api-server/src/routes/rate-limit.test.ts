// =============================================
// API Rate Limiting 테스트
// =============================================

import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  config: {
    system: { nodeEnv: 'test' },
    naver: { clientSecret: 'test' },
  },
}))

describe('API Rate Limiting', () => {
  it('글로벌 rate limit 초과 시 429 반환', async () => {
    const app = Fastify()
    await app.register(rateLimit, {
      max: 3,
      timeWindow: '1 minute',
    })

    app.get('/test', async () => ({ ok: true }))

    // 3번은 성공
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: 'GET', url: '/test' })
      expect(res.statusCode).toBe(200)
    }

    // 4번째는 429
    const res = await app.inject({ method: 'GET', url: '/test' })
    expect(res.statusCode).toBe(429)
  })

  it('429 응답에 Retry-After 헤더 포함', async () => {
    const app = Fastify()
    await app.register(rateLimit, {
      max: 1,
      timeWindow: '1 minute',
    })

    app.get('/test', async () => ({ ok: true }))

    await app.inject({ method: 'GET', url: '/test' })
    const res = await app.inject({ method: 'GET', url: '/test' })

    expect(res.statusCode).toBe(429)
    expect(res.headers['retry-after']).toBeDefined()
  })

  it('라우트별 rate limit 오버라이드 적용 가능', async () => {
    const app = Fastify()
    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
    })

    app.get('/strict', {
      config: { rateLimit: { max: 2, timeWindow: '1 minute' } },
    }, async () => ({ ok: true }))

    // 2번 성공
    await app.inject({ method: 'GET', url: '/strict' })
    await app.inject({ method: 'GET', url: '/strict' })

    // 3번째 429
    const res = await app.inject({ method: 'GET', url: '/strict' })
    expect(res.statusCode).toBe(429)
  })
})
