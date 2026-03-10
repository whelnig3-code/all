// =============================================
// 주문 승인 타임아웃 워커 테스트 (Phase 4.5)
//
// 검증 항목:
//   1. 알 수 없는 action → 스킵
//   2. check_timeout → handleApprovalTimeout ok → processed: true
//   3. check_timeout → handleApprovalTimeout fail → processed: false
//   4. handleApprovalTimeout throw → 에러 전파
//   5. Kill Switch 의도적 미적용 (타임아웃은 항상 실행)
// =============================================

import type { Job } from 'bullmq'
import type { OrderApprovalJobData } from '../queues'

// =============================================
// BullMQ Mock
// =============================================

let mockCapturedProcessor: ((job: Job<OrderApprovalJobData>) => Promise<unknown>) | null = null

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(
    (_queueName: string, processor: (job: Job<OrderApprovalJobData>) => Promise<unknown>) => {
      mockCapturedProcessor = processor
      return { on: jest.fn() }
    },
  ),
}))

// =============================================
// 의존성 Mock
// =============================================

const mockHandleApprovalTimeout = jest.fn()

jest.mock('@smartstore/core', () => ({
  handleApprovalTimeout: (...args: unknown[]) => mockHandleApprovalTimeout(...args),
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
  QUEUE_NAMES: { ORDER_APPROVAL: 'order-approval' },
}))

// =============================================
// 테스트
// =============================================

import { createOrderApprovalWorker } from './order-approval.job'
import * as fs from 'fs'
import * as path from 'path'

function makeApprovalJob(
  orderId: string = 'order-1',
  action: string = 'check_timeout',
): Job<OrderApprovalJobData> {
  return {
    id: `job-approval-${orderId}`,
    data: {
      orderId,
      approvalToken: 'token-abc',
      action: action as 'check_timeout',
    },
  } as Job<OrderApprovalJobData>
}

describe('createOrderApprovalWorker — 승인 타임아웃', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCapturedProcessor = null
  })

  it('알 수 없는 action → 스킵', async () => {
    createOrderApprovalWorker()
    const result = await mockCapturedProcessor!(makeApprovalJob('order-1', 'unknown_action'))

    expect(result).toEqual({ skipped: true, reason: 'unknown_action' })
    expect(mockHandleApprovalTimeout).not.toHaveBeenCalled()
  })

  it('check_timeout → handleApprovalTimeout ok → processed: true', async () => {
    mockHandleApprovalTimeout.mockResolvedValue({ ok: true })

    createOrderApprovalWorker()
    const result = await mockCapturedProcessor!(makeApprovalJob('order-1'))

    expect(result).toEqual({ orderId: 'order-1', processed: true })
    expect(mockHandleApprovalTimeout).toHaveBeenCalledWith('order-1')
  })

  it('check_timeout → handleApprovalTimeout 실패 → processed: false', async () => {
    mockHandleApprovalTimeout.mockResolvedValue({ ok: false, error: new Error('실패') })

    createOrderApprovalWorker()
    const result = await mockCapturedProcessor!(makeApprovalJob('order-1'))

    expect(result).toEqual({ orderId: 'order-1', processed: false })
  })

  it('handleApprovalTimeout throw → 에러 전파', async () => {
    mockHandleApprovalTimeout.mockRejectedValue(new Error('DB 오류'))

    createOrderApprovalWorker()
    await expect(mockCapturedProcessor!(makeApprovalJob('order-1'))).rejects.toThrow('DB 오류')
  })

  // 의도적으로 Kill Switch가 없음 — 타임아웃 검사는 항상 실행되어야 함
  // 만약 Kill Switch가 있으면 주문이 영구 대기 상태에 빠질 수 있음
  it('Kill Switch 없이 즉시 실행됨 (의도적 설계)', async () => {
    mockHandleApprovalTimeout.mockResolvedValue({ ok: true })

    createOrderApprovalWorker()
    const result = await mockCapturedProcessor!(makeApprovalJob('order-1'))

    // Kill Switch 체크 없이 바로 처리됨
    expect(result).toEqual({ orderId: 'order-1', processed: true })
  })
})

describe('order-approval.job.ts — console.log 부재', () => {
  it('소스 파일에 console.log가 없음', () => {
    const filePath = path.resolve(__dirname, './order-approval.job.ts')
    const source = fs.readFileSync(filePath, 'utf8')
    const consoleUsages = source.match(/console\.(log|warn|error|info)\(/g)
    expect(consoleUsages).toBeNull()
  })
})
