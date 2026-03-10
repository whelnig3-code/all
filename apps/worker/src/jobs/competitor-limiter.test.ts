// =============================================
// 경쟁사 실조회 Promise Queue Mutex 단위 테스트
// =============================================

import {
  fetchCompetitorCountLimited,
  getQueueDepth,
  MAX_QUEUE_DEPTH,
  _resetQueueForTest,
} from './competitor-limiter'
import type { CompetitorPrice } from '@smartstore/crawlers'

// @smartstore/crawlers 모킹
jest.mock('@smartstore/crawlers', () => ({
  naverShoppingCrawler: {
    fetchCompetitorPrices: jest.fn(),
  },
}))

// @smartstore/shared 로거 모킹
jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}))

const { naverShoppingCrawler } = jest.requireMock('@smartstore/crawlers') as {
  naverShoppingCrawler: { fetchCompetitorPrices: jest.Mock }
}

describe('fetchCompetitorCountLimited — Promise Queue Mutex', () => {
  beforeEach(() => {
    _resetQueueForTest()
    jest.clearAllMocks()
  })

  // ---- 기본 동작 ----

  it('정상 조회 → 경쟁사 수 반환', async () => {
    naverShoppingCrawler.fetchCompetitorPrices.mockResolvedValue(
      Array(7).fill({ sellerName: 'A', price: 10000, rank: 1 }) as CompetitorPrice[]
    )

    const count = await fetchCompetitorCountLimited('테스트 상품')

    expect(count).toBe(7)
  })

  it('오류 발생 → fallback 50 반환 (reject 없음)', async () => {
    naverShoppingCrawler.fetchCompetitorPrices.mockRejectedValue(
      new Error('network error')
    )

    await expect(fetchCompetitorCountLimited('에러 상품')).resolves.toBe(50)
  })

  it('타임아웃 → fallback 50 반환', async () => {
    jest.useFakeTimers()

    // 절대 resolve되지 않는 Promise (타임아웃 유발)
    naverShoppingCrawler.fetchCompetitorPrices.mockReturnValue(
      new Promise<CompetitorPrice[]>(() => {})
    )

    const promise = fetchCompetitorCountLimited('타임아웃 상품')

    // queue.then() 마이크로태스크 플러시
    await Promise.resolve()

    // 5초 이상 경과 → timeout reject 발생
    jest.advanceTimersByTime(6000)

    const count = await promise
    expect(count).toBe(50)

    jest.useRealTimers()
  })

  // ---- 순차 실행 보장 ----

  it('동시 2회 호출 시 순차 실행 보장 (두 번째는 첫 번째 완료 후 시작)', async () => {
    const callOrder: string[] = []

    let resolveFirst!: (v: CompetitorPrice[]) => void

    naverShoppingCrawler.fetchCompetitorPrices
      .mockImplementationOnce(() => {
        callOrder.push('first_started')
        return new Promise<CompetitorPrice[]>(resolve => {
          resolveFirst = resolve
        })
      })
      .mockImplementation(() => {
        callOrder.push('second_started')
        return Promise.resolve([
          { sellerName: 'B', price: 5000, rank: 1 },
        ] as CompetitorPrice[])
      })

    // 두 호출을 동시에 시작 (Promise 체인에 순서대로 적재)
    const promise1 = fetchCompetitorCountLimited('상품A')
    const promise2 = fetchCompetitorCountLimited('상품B')

    // queue.then()의 마이크로태스크가 실행되도록 한 틱 대기
    await Promise.resolve()

    // 이 시점에서 첫 번째 호출만 시작되어야 함
    expect(callOrder).toEqual(['first_started'])
    expect(callOrder).not.toContain('second_started')

    // 첫 번째 완료 처리
    resolveFirst([
      { sellerName: 'A', price: 1000, rank: 1 },
      { sellerName: 'B', price: 2000, rank: 2 },
    ] as CompetitorPrice[])

    const [count1, count2] = await Promise.all([promise1, promise2])

    // 두 번째는 첫 번째 완료 후 시작됨 (순차 실행 보장)
    expect(callOrder).toEqual(['first_started', 'second_started'])
    expect(count1).toBe(2)
    expect(count2).toBe(1)
  })

  it('첫 번째 실패해도 두 번째 정상 실행 (큐 체인 계속 유지)', async () => {
    naverShoppingCrawler.fetchCompetitorPrices
      .mockRejectedValueOnce(new Error('first error'))
      .mockResolvedValue([{ sellerName: 'B', price: 5000, rank: 1 }] as CompetitorPrice[])

    // 첫 번째 실패 → 50 반환
    const count1 = await fetchCompetitorCountLimited('실패 상품')
    // 두 번째 정상 → 1 반환
    const count2 = await fetchCompetitorCountLimited('정상 상품')

    expect(count1).toBe(50)
    expect(count2).toBe(1)
  })

  // ---- 큐 심도 상한 (R3) ----

  it(`큐 심도 MAX(${MAX_QUEUE_DEPTH}) 초과 시 즉시 fallback 50 반환`, async () => {
    // 절대 완료되지 않는 작업으로 큐를 MAX_QUEUE_DEPTH까지 채움
    naverShoppingCrawler.fetchCompetitorPrices.mockReturnValue(
      new Promise<CompetitorPrice[]>(() => {}) // neverResolve
    )

    // MAX_QUEUE_DEPTH개 요청을 큐에 쌓음 (완료되지 않음)
    const pending: Promise<number>[] = []
    for (let i = 0; i < MAX_QUEUE_DEPTH; i++) {
      pending.push(fetchCompetitorCountLimited(`상품${i}`))
    }

    // 큐가 꽉 찬 상태 확인
    expect(getQueueDepth()).toBe(MAX_QUEUE_DEPTH)

    // 초과 요청 → 즉시 fallback 50 (큐 대기 없이)
    const count = await fetchCompetitorCountLimited('초과 상품')
    expect(count).toBe(50)

    // 초과 요청은 심도를 증가시키지 않음
    expect(getQueueDepth()).toBe(MAX_QUEUE_DEPTH)

    // 테스트 후 큐 초기화
    _resetQueueForTest()
  })

  it('완료 후 queueDepth 복구 → 0', async () => {
    naverShoppingCrawler.fetchCompetitorPrices.mockResolvedValue([])

    await fetchCompetitorCountLimited('심도 복구 테스트')

    expect(getQueueDepth()).toBe(0)
  })

  it('오류 후에도 queueDepth 복구 → 0 (finally 보장)', async () => {
    naverShoppingCrawler.fetchCompetitorPrices.mockRejectedValue(new Error('err'))

    await fetchCompetitorCountLimited('오류 심도 복구')

    expect(getQueueDepth()).toBe(0)
  })
})
