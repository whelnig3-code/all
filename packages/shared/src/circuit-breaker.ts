// =============================================
// 서킷 브레이커 패턴
// - 비유: 전기 차단기. 과전류(연속 실패)가 감지되면 차단기가 내려가서
//   더 이상의 피해를 막고, 일정 시간 후 다시 시도한다.
// - 상태: CLOSED(정상) → OPEN(차단) → HALF_OPEN(시험)
// =============================================

import { createLogger } from './logger'

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

interface CircuitBreakerOptions {
  /** 서킷 이름 (로그용) */
  name: string
  /** 연속 실패 허용 횟수 (기본: 5) */
  failureThreshold?: number
  /** 차단 지속 시간 ms (기본: 60초) */
  resetTimeoutMs?: number
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED'
  private failureCount = 0
  private lastFailureTime: number | null = null
  private readonly failureThreshold: number
  private readonly resetTimeoutMs: number
  private readonly logger

  constructor(options: CircuitBreakerOptions) {
    this.failureThreshold = options.failureThreshold ?? 5
    this.resetTimeoutMs = options.resetTimeoutMs ?? 60_000
    this.logger = createLogger(`circuit-breaker:${options.name}`)
  }

  /** 현재 서킷 상태 */
  getState(): CircuitState {
    if (this.state === 'OPEN' && this.shouldAttemptReset()) {
      this.state = 'HALF_OPEN'
    }
    return this.state
  }

  /** 서킷을 통해 비동기 함수 실행 */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState()

    if (currentState === 'OPEN') {
      throw new Error('서킷 브레이커 OPEN — 요청 차단 중')
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.logger.info('HALF_OPEN → CLOSED 복구')
    }
    this.failureCount = 0
    this.state = 'CLOSED'
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN'
      this.logger.warn(`서킷 OPEN — 연속 ${this.failureCount}회 실패`, {
        threshold: this.failureThreshold,
        resetAfterMs: this.resetTimeoutMs,
      })
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false
    return Date.now() - this.lastFailureTime >= this.resetTimeoutMs
  }
}
