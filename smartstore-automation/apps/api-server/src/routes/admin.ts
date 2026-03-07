// =============================================
// Admin API 라우터
// 운영 제어용 내부 API — Basic Auth 필수
//
// 엔드포인트:
//   GET  /admin/system    — 시스템 상태 (Worker/DB/Redis/Memory)
//   GET  /admin/metrics   — 오늘 실적 (매출/순익/주문수)
//   POST /admin/control   — Kill Switch 제어
//
// 인증: HTTP Basic Auth (ADMIN_USER:ADMIN_PASS)
// =============================================

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { Redis } from 'ioredis'
import { prisma } from '@smartstore/db'
import { config, createLogger } from '@smartstore/shared'

const logger = createLogger('admin-api')

/** 허용된 제어 키 목록 (Kill Switch + 셀러 유형) */
const ALLOWED_CONTROL_KEYS = [
  'AUTO_PRICE_ENABLED',
  'AUTO_ORDER_ENABLED',
  'AUTO_SHIPPING_ENABLED',
  'AUTO_INVENTORY_SYNC_ENABLED',
  'ORDER_APPROVAL_MODE',
  'SELLER_TYPE',
] as const

type ControlKey = (typeof ALLOWED_CONTROL_KEYS)[number]

/** 키별 허용 값 맵 (미등록 키는 "true"/"false" 기본) */
const ALLOWED_VALUES: Partial<Record<ControlKey, readonly string[]>> = {
  SELLER_TYPE: ['individual', 'business'],
}

// =============================================
// Basic Auth 헬퍼
// =============================================

/**
 * Authorization 헤더에서 Basic Auth 자격증명 검증
 * base64 디코딩 → user:pass 비교
 */
function verifyBasicAuth(authHeader: string | undefined): boolean {
  if (!authHeader?.startsWith('Basic ')) return false
  try {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8')
    const colonIdx = decoded.indexOf(':')
    if (colonIdx === -1) return false
    const user = decoded.slice(0, colonIdx)
    const pass = decoded.slice(colonIdx + 1)
    // 폴백 기본값 제거 — validateAdminPassword()가 시작 시 보장
    return (
      user === process.env['ADMIN_USER'] &&
      pass === process.env['ADMIN_PASS']
    )
  } catch {
    return false
  }
}

// =============================================
// Redis 연결 (Redis 상태 확인용 임시 인스턴스)
// =============================================
let redisClient: Redis | null = null

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      ...(config.redis.password ? { password: config.redis.password } : {}),
      // 연결 실패 시 재시도 없이 즉시 종료 (상태 확인 목적)
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    })
    redisClient.on('error', () => {/* 연결 오류 무시 */})
  }
  return redisClient
}

// =============================================
// 라우터
// =============================================

export const adminRouter: FastifyPluginAsync = async (fastify) => {
  // 모든 /admin/* 요청에 Basic Auth 적용
  fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!verifyBasicAuth(req.headers['authorization'])) {
      logger.warn('Admin API 인증 실패', { ip: req.ip, url: req.url })
      return reply
        .code(401)
        .header('WWW-Authenticate', 'Basic realm="Smartstore Admin"')
        .send({ error: 'Unauthorized' })
    }
  })

  // =============================================
  // GET /admin/system — 시스템 상태
  // =============================================
  fastify.get('/system', async (_req, reply) => {
    // DB 연결 확인(SELECT 1) + Kill Switch 설정값 조회를 병렬 실행
    const [dbConnected, settingsRows] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      // DB 오류 시 빈 배열 반환 → 기본값(활성화) 사용
      prisma.systemSetting
        .findMany({
          where: { key: { in: [...ALLOWED_CONTROL_KEYS] } },
          select: { key: true, value: true },
        })
        .catch((): Array<{ key: string; value: string }> => []),
    ])

    // Redis 연결 확인 (PING)
    let redisConnected = false
    try {
      const redis = getRedisClient()
      await redis.connect().catch(() => {/* 이미 연결된 경우 무시 */})
      const pong = await redis.ping()
      redisConnected = pong === 'PONG'
    } catch {
      redisConnected = false
    }

    // 메모리 사용량 (MB 단위)
    const mem = process.memoryUsage()

    // 설정값 빌드 (Kill Switch 기본값: "true", SELLER_TYPE 기본값: "individual")
    const settings: Record<ControlKey, string> = {
      AUTO_PRICE_ENABLED: 'true',
      AUTO_ORDER_ENABLED: 'true',
      AUTO_SHIPPING_ENABLED: 'true',
      AUTO_INVENTORY_SYNC_ENABLED: 'true',
      ORDER_APPROVAL_MODE: 'false',
      SELLER_TYPE: 'individual',
    }
    for (const row of settingsRows) {
      if (ALLOWED_CONTROL_KEYS.includes(row.key as ControlKey)) {
        settings[row.key as ControlKey] = row.value
      }
    }

    const response = {
      workerAlive: redisConnected, // Redis 연결 = Worker 연결 가정 (BullMQ 공유 Redis)
      dbConnected,
      redisConnected,
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      },
      competitorQueueDepth: 0, // TODO: Worker에서 Redis key 'worker:queueDepth'로 공유
      timestamp: new Date().toISOString(),
      settings, // Kill Switch 현재 설정값 (대시보드 토글 초기화용)
    }

    logger.debug('시스템 상태 조회', { dbConnected, redisConnected })
    return reply.send(response)
  })

  // =============================================
  // GET /admin/metrics — 오늘 실적
  // =============================================
  fastify.get('/metrics', async (_req, reply) => {
    // KST 기준 오늘 0시 00분 → UTC로 변환 (KST = UTC+9)
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const todayKSTMidnight = new Date(nowKST)
    todayKSTMidnight.setUTCHours(0, 0, 0, 0)
    const todayUTC = new Date(todayKSTMidnight.getTime() - 9 * 60 * 60 * 1000)

    const dateStr = nowKST.toISOString().slice(0, 10) // YYYY-MM-DD

    try {
      // 오늘 주문 집계 (KST 기준 0시 이후)
      const result = await prisma.order.aggregate({
        where: { createdAt: { gte: todayUTC } },
        _sum: {
          salePrice: true,
          marginAmount: true,
        },
        _count: { id: true },
      })

      // 오늘 실패 job 수
      const failedJobCount = await prisma.jobLog.count({
        where: {
          status: 'failed',
          startedAt: { gte: todayUTC },
        },
      })

      return reply.send({
        totalRevenue: result._sum.salePrice ?? 0,
        totalMargin: Math.round(result._sum.marginAmount ?? 0),
        orderCount: result._count.id,
        fallbackCount: 0,   // 추후 구현: JobLog 기반 fallback 카운팅
        failedJobCount,
        date: dateStr,
      })
    } catch (error) {
      logger.error('metrics 쿼리 실패', { error })
      return reply.code(500).send({ error: 'metrics query failed', detail: String(error) })
    }
  })

  // =============================================
  // POST /admin/control — Kill Switch 제어
  // =============================================
  fastify.post('/control', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const key = body['key']
    const value = body['value']

    // key 유효성 검증
    if (!ALLOWED_CONTROL_KEYS.includes(key as ControlKey)) {
      return reply.code(400).send({
        error: 'invalid key',
        allowed: ALLOWED_CONTROL_KEYS,
        received: key,
      })
    }

    const controlKey = key as ControlKey

    // value 유효성 검증 (키별 허용값 또는 기본 "true"/"false")
    const allowedValues = ALLOWED_VALUES[controlKey] ?? ['true', 'false']
    if (!allowedValues.includes(value as string)) {
      return reply.code(400).send({
        error: `invalid value — must be one of: ${allowedValues.join(', ')}`,
        received: value,
      })
    }

    const controlValue = value as string

    try {
      // DB에 설정값 upsert (없으면 create, 있으면 update)
      const updated = await prisma.systemSetting.upsert({
        where: { key: controlKey },
        update: { value: controlValue },
        create: { key: controlKey, value: controlValue },
      })

      logger.info('Kill Switch 제어 완료', { key: controlKey, value: controlValue })

      return reply.send({
        success: true,
        key: updated.key,
        value: updated.value,
        updatedAt: updated.updatedAt,
      })
    } catch (error) {
      logger.error('Kill Switch 업데이트 실패', { key: controlKey, error })
      return reply.code(500).send({ error: 'control update failed', detail: String(error) })
    }
  })
}
