// =============================================
// 콘텐츠 생성 워커 통합 테스트
//
// 검증 항목:
//   1. LLM 성공 → DB 저장 + 네이버 업데이트
//   2. rawDescription 없음 → skip
//   3. 상품 미존재 → 에러 throw
//   4. 네이버 업데이트 실패 → DB만 저장 (degrade)
//   5. console.log 부재 (정적 분석)
// =============================================

import * as fs from 'fs'
import * as path from 'path'
import type { Job } from 'bullmq'

// =============================================
// Mock 선언 (jest.mock은 호이스팅되므로 import 전에 위치)
// =============================================

let mockCapturedProcessor: ((job: Job) => Promise<unknown>) | null = null

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(
    (_queueName: string, processor: (job: Job) => Promise<unknown>) => {
      mockCapturedProcessor = processor
      return { on: jest.fn() }
    },
  ),
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    addBulk: jest.fn(),
    close: jest.fn(),
  })),
}))

const mockProduct = {
  id: 'prod-1',
  name: '테스트 드릴 세트',
  rawDescription: '원문 설명 텍스트입니다',
  categoryName: '공구/전동',
  salePrice: 25000,
  naverProductId: '12345',
  status: 'active',
}

const mockDescriptionResult = {
  highlights: ['고품질 비트 포함', '인체공학 그립', '배터리 12시간'],
  detailDescription: '이 드릴 세트는 전문가용으로 설계되었습니다.',
  cautions: '어린이 손이 닿지 않는 곳에 보관하세요.',
  generatedBy: 'ollama:llama3.2',
}

jest.mock('@smartstore/core', () => ({
  generateProductDescription: jest.fn().mockResolvedValue({
    highlights: ['고품질 비트 포함', '인체공학 그립', '배터리 12시간'],
    detailDescription: '이 드릴 세트는 전문가용으로 설계되었습니다.',
    cautions: '어린이 손이 닿지 않는 곳에 보관하세요.',
    generatedBy: 'ollama:llama3.2',
  }),
  optimizeProductTitle: jest.fn().mockImplementation(({ originalName }: { originalName: string }) => originalName),
  generateSearchTags: jest.fn().mockReturnValue(['드릴', '세트', '전동공구']),
}))

jest.mock('@smartstore/adapters', () => ({
  llmAdapter: { generate: jest.fn() },
  notificationAdapter: { send: jest.fn().mockResolvedValue(undefined) },
}))

jest.mock('@smartstore/integrations', () => ({
  updateProductDescription: jest.fn().mockResolvedValue(true),
}))

jest.mock('@smartstore/db', () => ({
  prisma: {
    jobLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    product: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}))

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  config: {
    redis: { host: 'localhost', port: 6379, password: undefined },
  },
}))

jest.mock('../queues', () => ({
  QUEUE_NAMES: { CONTENT_GENERATION: 'content-generation' },
}))

// =============================================
// Import (mock 설정 후)
// =============================================

import { createContentWorker } from './content.job'

// =============================================
// 테스트
// =============================================

describe('createContentWorker', () => {
  const { prisma } = jest.requireMock('@smartstore/db') as {
    prisma: {
      product: { findUnique: jest.Mock; update: jest.Mock }
      jobLog: { create: jest.Mock; update: jest.Mock }
    }
  }
  const { updateProductDescription } = jest.requireMock('@smartstore/integrations') as {
    updateProductDescription: jest.Mock
  }
  const { notificationAdapter } = jest.requireMock('@smartstore/adapters') as {
    notificationAdapter: { send: jest.Mock }
  }

  function makeJob(productId: string, jobId = 'job-1'): Job {
    return { id: jobId, data: { productId } } as Job
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockCapturedProcessor = null
    prisma.product.findUnique.mockResolvedValue({ ...mockProduct })
  })

  it('LLM 성공 → DB 저장 + 네이버 업데이트 + 알림', async () => {
    createContentWorker()
    const result = await mockCapturedProcessor!(makeJob('prod-1'))

    // DB에 generatedDescription 저장
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-1' },
        data: expect.objectContaining({
          generatedDescription: expect.stringContaining('고품질 비트 포함'),
          descriptionModel: 'ollama:llama3.2',
        }),
      }),
    )

    // 네이버 업데이트 호출
    expect(updateProductDescription).toHaveBeenCalledWith(
      12345,
      expect.stringContaining('고품질 비트 포함'),
    )

    // 알림 전송
    expect(notificationAdapter.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'content_generated' }),
    )

    expect(result).toEqual({ success: true, model: 'ollama:llama3.2' })
  })

  it('rawDescription 없음 → skip 반환', async () => {
    prisma.product.findUnique.mockResolvedValue({
      ...mockProduct,
      rawDescription: null,
    })

    createContentWorker()
    const result = await mockCapturedProcessor!(makeJob('prod-1'))

    expect(result).toEqual({ skipped: true })

    // 네이버 업데이트 미호출
    expect(updateProductDescription).not.toHaveBeenCalled()

    // jobLog에 skip 기록
    expect(prisma.jobLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          result: expect.objectContaining({ skipped: true }),
        }),
      }),
    )
  })

  it('상품 미존재 → 에러 throw', async () => {
    prisma.product.findUnique.mockResolvedValue(null)

    createContentWorker()

    await expect(mockCapturedProcessor!(makeJob('nonexistent'))).rejects.toThrow(
      '상품을 찾을 수 없습니다',
    )

    // jobLog에 failed 기록
    expect(prisma.jobLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    )
  })

  it('네이버 업데이트 실패 → DB만 저장 (degrade)', async () => {
    updateProductDescription.mockResolvedValue(false)

    createContentWorker()
    const result = await mockCapturedProcessor!(makeJob('prod-1'))

    // DB 저장은 성공
    expect(prisma.product.update).toHaveBeenCalled()
    // 네이버 실패해도 성공 반환
    expect(result).toEqual({ success: true, model: 'ollama:llama3.2' })
  })

  it('naverProductId 없으면 네이버 업데이트 건너뜀', async () => {
    prisma.product.findUnique.mockResolvedValue({
      ...mockProduct,
      naverProductId: null,
    })

    createContentWorker()
    await mockCapturedProcessor!(makeJob('prod-1'))

    expect(updateProductDescription).not.toHaveBeenCalled()
  })
})

// =============================================
// console.log 부재 검증 (정적 분석)
// =============================================

describe('content.job.ts — console.log 부재 검증', () => {
  it('소스 파일에 console.log가 없음', () => {
    const filePath = path.resolve(__dirname, './content.job.ts')
    const source = fs.readFileSync(filePath, 'utf8')
    const consoleUsages = source.match(/console\.(log|warn|error|info)\(/g)
    expect(consoleUsages).toBeNull()
  })
})
