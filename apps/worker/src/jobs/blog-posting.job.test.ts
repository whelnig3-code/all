// =============================================
// 블로그 포스팅 워커 통합 테스트
//
// 검증 항목:
//   1. 성공 → 블로그 게시 + 알림 + DB 업데이트
//   2. 게시 실패 → failed 반환 (throw 없음)
//   3. 예상치 못한 오류 → error 반환 (throw 없음)
//   4. fire-and-forget: 어떤 경우에도 throw 하지 않음
//   5. 중복 포스팅 방지: blogPostUrl 이미 있으면 스킵
//   6. 일일 포스팅 한도 초과 시 스킵
//   7. 포스팅 성공 시 blogPostUrl + blogPostedAt DB 업데이트
//   8. console.log 부재 (정적 분석)
// =============================================

import * as fs from 'fs'
import * as path from 'path'
import type { Job } from 'bullmq'

// =============================================
// Mock 선언
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

jest.mock('@smartstore/core', () => ({
  generateBlogPost: jest.fn().mockResolvedValue({
    title: '[리뷰] 전동 드릴 세트 — 가정용 DIY 필수템',
    body: '<h2>전동 드릴 세트 상세 리뷰</h2><p>본문 내용</p>',
    tags: ['전동드릴', 'DIY', '공구'],
  }),
}))

jest.mock('@smartstore/integrations', () => ({
  postToNaverBlog: jest.fn().mockResolvedValue({
    success: true,
    postUrl: 'https://blog.naver.com/test/12345',
  }),
}))

jest.mock('@smartstore/adapters', () => ({
  notificationAdapter: { send: jest.fn().mockResolvedValue(undefined) },
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

jest.mock('@smartstore/db', () => ({
  prisma: {
    product: {
      findUnique: jest.fn().mockResolvedValue({ blogPostUrl: null }),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}))

jest.mock('../queues', () => ({
  QUEUE_NAMES: { BLOG_POSTING: 'blog-posting' },
}))

// 설정 캐시 — BLOG_DAILY_LIMIT 기본 '20'
jest.mock('../settings-cache', () => ({
  getSetting: jest.fn().mockReturnValue('20'),
}))

// 자격증명 게이트 — 항상 통과
jest.mock('../credential-gate', () => ({
  checkCredentialGate: jest.fn().mockResolvedValue({ passed: true, missing: [] }),
  gateSkipResult: jest.fn(),
}))

// =============================================
// Import
// =============================================

import { createBlogPostingWorker } from './blog-posting.job'

// =============================================
// 테스트
// =============================================

describe('createBlogPostingWorker', () => {
  const { generateBlogPost } = jest.requireMock('@smartstore/core') as {
    generateBlogPost: jest.Mock
  }
  const { postToNaverBlog } = jest.requireMock('@smartstore/integrations') as {
    postToNaverBlog: jest.Mock
  }
  const { notificationAdapter } = jest.requireMock('@smartstore/adapters') as {
    notificationAdapter: { send: jest.Mock }
  }
  const { prisma } = jest.requireMock('@smartstore/db') as {
    prisma: {
      product: {
        findUnique: jest.Mock
        count: jest.Mock
        update: jest.Mock
      }
    }
  }
  const { getSetting } = jest.requireMock('../settings-cache') as {
    getSetting: jest.Mock
  }

  const defaultJobData = {
    productId: 'prod-1',
    productName: '전동 드릴 세트',
    category: '공구/전동',
    salePrice: 25000,
    description: '원문 설명',
  }

  function makeJob(data = defaultJobData, jobId = 'job-1'): Job {
    return { id: jobId, data } as Job
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockCapturedProcessor = null

    // 기본값 재설정
    prisma.product.findUnique.mockResolvedValue({ blogPostUrl: null })
    prisma.product.count.mockResolvedValue(0)
    prisma.product.update.mockResolvedValue({})
    getSetting.mockReturnValue('20')

    generateBlogPost.mockResolvedValue({
      title: '[리뷰] 전동 드릴 세트 — 가정용 DIY 필수템',
      body: '<h2>전동 드릴 세트 상세 리뷰</h2><p>본문 내용</p>',
      tags: ['전동드릴', 'DIY', '공구'],
    })

    postToNaverBlog.mockResolvedValue({
      success: true,
      postUrl: 'https://blog.naver.com/test/12345',
    })
  })

  // ---- 기존 테스트 ----

  it('성공 → 블로그 게시 + 알림 + posted 반환', async () => {
    createBlogPostingWorker()
    const result = await mockCapturedProcessor!(makeJob())

    // generateBlogPost 호출
    expect(generateBlogPost).toHaveBeenCalledWith(
      expect.objectContaining({
        productName: '전동 드릴 세트',
        category: '공구/전동',
        salePrice: 25000,
      }),
    )

    // postToNaverBlog 호출
    expect(postToNaverBlog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('전동 드릴 세트'),
        tags: '전동드릴,DIY,공구',
      }),
    )

    // 알림 전송
    expect(notificationAdapter.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'blog_posted' }),
    )

    expect(result).toEqual({
      action: 'posted',
      postUrl: 'https://blog.naver.com/test/12345',
    })
  })

  it('네이버 게시 실패 → failed 반환 (throw 없음)', async () => {
    postToNaverBlog.mockResolvedValue({
      success: false,
      error: 'OAuth token expired',
    })

    createBlogPostingWorker()
    const result = await mockCapturedProcessor!(makeJob())

    expect(result).toEqual({
      action: 'failed',
      error: 'OAuth token expired',
    })

    expect(notificationAdapter.send).not.toHaveBeenCalled()
  })

  it('예상치 못한 오류 → error 반환 (throw 없음, fire-and-forget)', async () => {
    generateBlogPost.mockRejectedValue(new Error('LLM 서버 연결 실패'))

    createBlogPostingWorker()
    const result = await mockCapturedProcessor!(makeJob())

    expect(result).toEqual({
      action: 'error',
      error: 'LLM 서버 연결 실패',
    })
  })

  it('postUrl 없으면 알림 미전송', async () => {
    postToNaverBlog.mockResolvedValue({
      success: true,
      postUrl: undefined,
    })

    createBlogPostingWorker()
    await mockCapturedProcessor!(makeJob())

    expect(notificationAdapter.send).not.toHaveBeenCalled()
  })

  // ---- 중복 포스팅 방지 ----

  it('이미 blogPostUrl이 있는 상품 → skipped (중복 방지)', async () => {
    prisma.product.findUnique.mockResolvedValue({
      blogPostUrl: 'https://blog.naver.com/existing/999',
    })

    createBlogPostingWorker()
    const result = await mockCapturedProcessor!(makeJob())

    expect(result).toEqual({
      action: 'skipped',
      reason: 'already_posted',
    })

    // 포스트 생성/게시 함수 호출되지 않아야 함
    expect(generateBlogPost).not.toHaveBeenCalled()
    expect(postToNaverBlog).not.toHaveBeenCalled()
  })

  // ---- 일일 포스팅 한도 ----

  it('일일 포스팅 한도 (20개) 초과 시 skipped', async () => {
    prisma.product.count.mockResolvedValue(20)

    createBlogPostingWorker()
    const result = await mockCapturedProcessor!(makeJob())

    expect(result).toEqual({
      action: 'skipped',
      reason: 'daily_limit',
    })

    expect(generateBlogPost).not.toHaveBeenCalled()
    expect(postToNaverBlog).not.toHaveBeenCalled()
  })

  it('일일 한도를 SystemSetting에서 조회 (BLOG_DAILY_LIMIT)', async () => {
    getSetting.mockReturnValue('5')
    prisma.product.count.mockResolvedValue(5)

    createBlogPostingWorker()
    const result = await mockCapturedProcessor!(makeJob())

    expect(result).toEqual({
      action: 'skipped',
      reason: 'daily_limit',
    })

    expect(getSetting).toHaveBeenCalledWith('BLOG_DAILY_LIMIT')
  })

  it('일일 한도 미달 시 포스팅 진행', async () => {
    prisma.product.count.mockResolvedValue(19)

    createBlogPostingWorker()
    const result = await mockCapturedProcessor!(makeJob())

    expect(result).toEqual({
      action: 'posted',
      postUrl: 'https://blog.naver.com/test/12345',
    })
  })

  // ---- DB 업데이트 ----

  it('포스팅 성공 시 blogPostUrl + blogPostedAt DB 업데이트', async () => {
    createBlogPostingWorker()
    await mockCapturedProcessor!(makeJob())

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: {
        blogPostUrl: 'https://blog.naver.com/test/12345',
        blogPostedAt: expect.any(Date),
      },
    })
  })

  it('포스팅 실패 시 DB 업데이트 없음', async () => {
    postToNaverBlog.mockResolvedValue({
      success: false,
      error: 'API error',
    })

    createBlogPostingWorker()
    await mockCapturedProcessor!(makeJob())

    expect(prisma.product.update).not.toHaveBeenCalled()
  })

  it('postUrl 없이 성공 시 DB 업데이트 없음', async () => {
    postToNaverBlog.mockResolvedValue({
      success: true,
      postUrl: undefined,
    })

    createBlogPostingWorker()
    await mockCapturedProcessor!(makeJob())

    expect(prisma.product.update).not.toHaveBeenCalled()
  })
})

// =============================================
// console.log 부재 검증 (정적 분석)
// =============================================

describe('blog-posting.job.ts — console.log 부재 검증', () => {
  it('소스 파일에 console.log가 없음', () => {
    const filePath = path.resolve(__dirname, './blog-posting.job.ts')
    const source = fs.readFileSync(filePath, 'utf8')
    const consoleUsages = source.match(/console\.(log|warn|error|info)\(/g)
    expect(consoleUsages).toBeNull()
  })
})
