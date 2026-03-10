// =============================================
// 등록 거부 분석 테스트 (TDD — Phase A-3)
//
// jobLog 데이터에서 거부 사유를 집계하여
// "왜 상품이 등록 안 되는가" 인사이트 도출
// =============================================

import { analyzeRejections, type JobLogEntry } from './rejection-analyzer'

const makeLog = (reason: string, extra?: Record<string, unknown>): JobLogEntry => ({
  id: `log-${Math.random()}`,
  jobType: 'product-registration',
  status: 'completed',
  result: { skipped: true, reason, ...extra },
  createdAt: new Date(),
})

describe('analyzeRejections', () => {
  it('빈 배열 → 빈 분석', () => {
    const result = analyzeRejections([])
    expect(result.total).toBe(0)
    expect(result.byReason).toEqual({})
  })

  it('단일 사유 집계', () => {
    const logs = [
      makeLog('exposure_blocked', { exposureScore: 45 }),
      makeLog('exposure_blocked', { exposureScore: 30 }),
      makeLog('exposure_blocked', { exposureScore: 55 }),
    ]
    const result = analyzeRejections(logs)
    expect(result.total).toBe(3)
    expect(result.byReason['exposure_blocked']).toBe(3)
  })

  it('다중 사유 집계', () => {
    const logs = [
      makeLog('exposure_blocked'),
      makeLog('exposure_blocked'),
      makeLog('margin_too_low'),
      makeLog('category_blocked'),
      makeLog('margin_too_low'),
      makeLog('competitor_count_exceeded'),
    ]
    const result = analyzeRejections(logs)
    expect(result.total).toBe(6)
    expect(result.byReason['exposure_blocked']).toBe(2)
    expect(result.byReason['margin_too_low']).toBe(2)
    expect(result.byReason['category_blocked']).toBe(1)
    expect(result.byReason['competitor_count_exceeded']).toBe(1)
  })

  it('비율(percentage) 계산', () => {
    const logs = [
      makeLog('exposure_blocked'),
      makeLog('exposure_blocked'),
      makeLog('exposure_blocked'),
      makeLog('margin_too_low'),
    ]
    const result = analyzeRejections(logs)
    expect(result.byPercentage['exposure_blocked']).toBe(75)
    expect(result.byPercentage['margin_too_low']).toBe(25)
  })

  it('상위 사유 정렬 (내림차순)', () => {
    const logs = [
      makeLog('a'),
      makeLog('b'), makeLog('b'),
      makeLog('c'), makeLog('c'), makeLog('c'),
    ]
    const result = analyzeRejections(logs)
    expect(result.topReasons[0].reason).toBe('c')
    expect(result.topReasons[1].reason).toBe('b')
    expect(result.topReasons[2].reason).toBe('a')
  })

  it('성공 로그는 무시', () => {
    const logs: JobLogEntry[] = [
      {
        id: 'log-1',
        jobType: 'product-registration',
        status: 'completed',
        result: { action: 'registered' }, // 성공
        createdAt: new Date(),
      },
      makeLog('exposure_blocked'),
    ]
    const result = analyzeRejections(logs)
    expect(result.total).toBe(1)
  })
})
