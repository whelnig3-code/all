// =============================================
// 자격증명 관리 API 라우터
// - Basic Auth 필수 (ADMIN_USER:ADMIN_PASS)
//
// 엔드포인트:
//   GET    /admin/credentials           — 전체 서비스 상태 (마스킹)
//   GET    /admin/credentials/:service  — 특정 서비스 상태 (마스킹)
//   PUT    /admin/credentials/:service  — 자격증명 저장
//   DELETE /admin/credentials/:service  — 자격증명 삭제
//   POST   /admin/credentials/:service/test — 연결 테스트
// =============================================

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { createLogger } from '@smartstore/shared'
import { prisma } from '@smartstore/db'
import {
  getCredentials,
  saveCredentials,
  deleteCredentials,
  getCredentialStatus,
  getAllServiceStatuses,
  maskValue,
  type ServiceType,
} from '@smartstore/core'
import { testServiceConnection } from './credential-tester'

const logger = createLogger('credentials-api')

const VALID_SERVICES: ServiceType[] = [
  'naver_commerce',
  'naver_blog',
  'domaegguk',
  'ownerclan',
  'telegram',
]

/** 서비스명 유효성 검증 */
function isValidService(service: string): service is ServiceType {
  return VALID_SERVICES.includes(service as ServiceType)
}

// =============================================
// Basic Auth 헬퍼 (admin.ts와 동일 패턴)
// =============================================

function verifyBasicAuth(authHeader: string | undefined): boolean {
  if (!authHeader?.startsWith('Basic ')) return false
  try {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8')
    const colonIdx = decoded.indexOf(':')
    if (colonIdx === -1) return false
    const user = decoded.slice(0, colonIdx)
    const pass = decoded.slice(colonIdx + 1)
    return (
      user === process.env['ADMIN_USER'] &&
      pass === process.env['ADMIN_PASS']
    )
  } catch {
    return false
  }
}

// =============================================
// 라우터
// =============================================

export const credentialsRouter: FastifyPluginAsync = async (fastify) => {
  // Basic Auth 적용
  fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!verifyBasicAuth(req.headers['authorization'])) {
      logger.warn('자격증명 API 인증 실패', { ip: req.ip, url: req.url })
      return reply
        .code(401)
        .header('WWW-Authenticate', 'Basic realm="Smartstore Admin"')
        .send({ error: 'Unauthorized' })
    }
  })

  // =============================================
  // GET /admin/credentials — 전체 서비스 상태 목록
  // =============================================
  fastify.get('/', async (_req, reply) => {
    try {
      const statuses = await getAllServiceStatuses()
      return reply.send({ services: statuses })
    } catch (error) {
      logger.error('자격증명 상태 조회 실패', { error })
      return reply.code(500).send({ error: 'Failed to get credential statuses' })
    }
  })

  // =============================================
  // GET /admin/credentials/:service — 특정 서비스 상태
  // =============================================
  fastify.get<{ Params: { service: string } }>(
    '/:service',
    async (request, reply) => {
      const { service } = request.params

      if (!isValidService(service)) {
        return reply.code(400).send({
          error: 'invalid service',
          allowed: VALID_SERVICES,
        })
      }

      try {
        const status = await getCredentialStatus(service)
        const creds = await getCredentials(service)

        const maskedFields: Record<string, string> = {}
        if (creds) {
          for (const [key, value] of Object.entries(creds)) {
            maskedFields[key] = maskValue(value)
          }
        }

        const row = await prisma.serviceCredential.findUnique({
          where: { service },
          select: { lastTestedAt: true, testResult: true, testError: true },
        })

        return reply.send({
          service,
          status,
          fields: maskedFields,
          lastTestedAt: row?.lastTestedAt ?? null,
          testResult: row?.testResult ?? null,
          testError: row?.testError ?? null,
        })
      } catch (error) {
        logger.error('서비스 상태 조회 실패', { service, error })
        return reply.code(500).send({ error: 'Failed to get service status' })
      }
    },
  )

  // =============================================
  // PUT /admin/credentials/:service — 자격증명 저장
  // =============================================
  fastify.put<{ Params: { service: string } }>(
    '/:service',
    async (request, reply) => {
      const { service } = request.params

      if (!isValidService(service)) {
        return reply.code(400).send({
          error: 'invalid service',
          allowed: VALID_SERVICES,
        })
      }

      const body = request.body as Record<string, unknown>
      const credentials = body['credentials'] as Record<string, string> | undefined

      if (!credentials || typeof credentials !== 'object') {
        return reply.code(400).send({
          error: 'credentials 필드가 필요합니다 (Record<string, string>)',
        })
      }

      try {
        await saveCredentials(service, credentials)
        logger.info('자격증명 저장 완료', { service })

        return reply.send({
          success: true,
          service,
          message: '자격증명이 저장되었습니다.',
        })
      } catch (error) {
        logger.error('자격증명 저장 실패', { service, error })
        return reply.code(500).send({ error: 'Failed to save credentials' })
      }
    },
  )

  // =============================================
  // DELETE /admin/credentials/:service — 자격증명 삭제
  // =============================================
  fastify.delete<{ Params: { service: string } }>(
    '/:service',
    async (request, reply) => {
      const { service } = request.params

      if (!isValidService(service)) {
        return reply.code(400).send({
          error: 'invalid service',
          allowed: VALID_SERVICES,
        })
      }

      try {
        await deleteCredentials(service)
        logger.info('자격증명 삭제 완료', { service })

        return reply.send({
          success: true,
          service,
          message: '자격증명이 삭제되었습니다.',
        })
      } catch (error) {
        logger.error('자격증명 삭제 실패', { service, error })
        return reply.code(500).send({ error: 'Failed to delete credentials' })
      }
    },
  )

  // =============================================
  // POST /admin/credentials/:service/test — 연결 테스트
  // =============================================
  fastify.post<{ Params: { service: string } }>(
    '/:service/test',
    async (request, reply) => {
      const { service } = request.params

      if (!isValidService(service)) {
        return reply.code(400).send({
          error: 'invalid service',
          allowed: VALID_SERVICES,
        })
      }

      try {
        const creds = await getCredentials(service)
        if (!creds) {
          return reply.code(400).send({
            error: '자격증명이 설정되지 않았습니다. 먼저 자격증명을 저장하세요.',
          })
        }

        const testResult = await testServiceConnection(service, creds)

        // DB에 테스트 결과 저장
        await prisma.serviceCredential.update({
          where: { service },
          data: {
            lastTestedAt: new Date(),
            testResult: testResult.success ? 'success' : 'failed',
            testError: testResult.error ?? null,
          },
        }).catch(() => {
          // DB 업데이트 실패해도 테스트 결과는 반환
        })

        return reply.send({
          service,
          success: testResult.success,
          message: testResult.message,
          error: testResult.error ?? null,
        })
      } catch (error) {
        logger.error('연결 테스트 실패', { service, error })
        return reply.code(500).send({ error: 'Connection test failed' })
      }
    },
  )
}
