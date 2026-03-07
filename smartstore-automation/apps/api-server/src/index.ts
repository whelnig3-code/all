// =============================================
// API 서버 메인 엔트리 포인트 (Fastify)
// =============================================

import crypto from 'crypto'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { config, createLogger } from '@smartstore/shared'
import { productsRouter } from './routes/products'
import { ordersRouter } from './routes/orders'
import { monitoringRouter } from './routes/monitoring'
import { webhooksRouter } from './routes/webhooks'
import { adminRouter } from './routes/admin'
import { reportRouter } from './routes/report'
import { credentialsRouter } from './routes/credentials'
import { inventoryRouter } from './routes/inventory'
import { startBotPolling } from '@smartstore/adapters'
import { validateAdminPassword } from './env-guard'

const logger = createLogger('api-server')

async function main() {
  // ADMIN_PASS 보안 검증 — 기본값("changeme") 또는 미설정 시 즉시 종료
  validateAdminPassword()

  const fastify = Fastify({
    logger: config.system.nodeEnv === 'development',
    genReqId: () => crypto.randomUUID(),
  })

  // 모든 응답에 X-Request-Id 헤더 추가 (디버깅용 correlation ID)
  fastify.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  // CORS 설정 — 개발: 전부 허용, 프로덕션: CORS_ORIGIN 환경변수 또는 비활성화
  const corsOrigin = config.system.nodeEnv === 'development'
    ? '*'
    : process.env['CORS_ORIGIN'] || false
  await fastify.register(cors, { origin: corsOrigin })

  // Rate Limiting — 글로벌: 100req/min, 엔드포인트별 오버라이드 가능
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true },
    addHeaders: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'retry-after': true },
  })

  // 라우트 등록
  await fastify.register(productsRouter, { prefix: '/products' })
  await fastify.register(ordersRouter, { prefix: '/orders' })
  await fastify.register(monitoringRouter, { prefix: '/monitoring' })
  await fastify.register(webhooksRouter, { prefix: '/webhooks' })
  await fastify.register(adminRouter, { prefix: '/admin' }) // 운영 제어 Admin API
  await fastify.register(reportRouter, { prefix: '/report' }) // 매출 리포트
  await fastify.register(credentialsRouter, { prefix: '/admin/credentials' }) // 자격증명 관리
  await fastify.register(inventoryRouter, { prefix: '/inventory' }) // 재고 관리

  // 글로벌 에러 핸들러 — 예상치 못한 에러를 로그하고 안전한 응답 반환
  fastify.setErrorHandler((error, request, reply) => {
    logger.error('요청 처리 중 에러', {
      requestId: request.id,
      method: request.method,
      url: request.url,
      error: error.message,
    })

    const statusCode = error.statusCode ?? 500
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? '내부 서버 오류' : error.message,
      requestId: request.id,
    })
  })

  // 루트 헬스체크
  fastify.get('/', async () => ({
    service: 'smartstore-automation-api',
    version: '1.0.0',
    phase: 'Phase 2',
    status: 'running',
  }))

  // 서버 시작
  try {
    await fastify.listen({
      port: config.system.port,
      host: '0.0.0.0',
    })
    logger.info(`API 서버 시작: http://0.0.0.0:${config.system.port}`)

    // Telegram 봇 long-polling 시작 (오류가 발생해도 서버 종료 방지)
    void startBotPolling()
  } catch (error) {
    logger.error('서버 시작 실패', error)
    process.exit(1)
  }

  // Graceful Shutdown — SIGTERM, SIGINT 모두 처리
  const shutdown = async (signal: string) => {
    logger.info(`${signal} 수신 — 서버 종료 시작`)
    await fastify.close()
    logger.info('API 서버 정상 종료 완료')
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main()
