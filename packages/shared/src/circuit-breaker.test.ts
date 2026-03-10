// =============================================
// 서킷 브레이커 테스트
// =============================================

import { CircuitBreaker } from './circuit-breaker'

describe('CircuitBreaker', () => {
  it('CLOSED 상태에서 성공하면 CLOSED 유지', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 })

    const result = await cb.execute(async () => 'ok')

    expect(result).toBe('ok')
    expect(cb.getState()).toBe('CLOSED')
  })

  it('실패가 threshold 미만이면 CLOSED 유지', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 })

    // 2번 실패 (threshold=3 미만)
    for (let i = 0; i < 2; i++) {
      await expect(
        cb.execute(async () => { throw new Error('fail') }),
      ).rejects.toThrow('fail')
    }

    expect(cb.getState()).toBe('CLOSED')
  })

  it('연속 실패가 threshold에 도달하면 OPEN', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 })

    for (let i = 0; i < 3; i++) {
      await expect(
        cb.execute(async () => { throw new Error('fail') }),
      ).rejects.toThrow('fail')
    }

    expect(cb.getState()).toBe('OPEN')
  })

  it('OPEN 상태에서 요청 즉시 거부', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1 })

    await expect(
      cb.execute(async () => { throw new Error('fail') }),
    ).rejects.toThrow('fail')

    // 이제 OPEN — 요청 자체가 차단됨
    await expect(
      cb.execute(async () => 'should-not-run'),
    ).rejects.toThrow('서킷 브레이커 OPEN')
  })

  it('resetTimeout 후 HALF_OPEN으로 전환', async () => {
    const cb = new CircuitBreaker({
      name: 'test',
      failureThreshold: 1,
      resetTimeoutMs: 100,
    })

    await expect(
      cb.execute(async () => { throw new Error('fail') }),
    ).rejects.toThrow()

    expect(cb.getState()).toBe('OPEN')

    // 100ms 대기 후 HALF_OPEN
    await new Promise((r) => setTimeout(r, 150))
    expect(cb.getState()).toBe('HALF_OPEN')
  })

  it('HALF_OPEN에서 성공하면 CLOSED 복구', async () => {
    const cb = new CircuitBreaker({
      name: 'test',
      failureThreshold: 1,
      resetTimeoutMs: 50,
    })

    await expect(
      cb.execute(async () => { throw new Error('fail') }),
    ).rejects.toThrow()

    await new Promise((r) => setTimeout(r, 100))
    expect(cb.getState()).toBe('HALF_OPEN')

    // 성공하면 CLOSED
    const result = await cb.execute(async () => 'recovered')
    expect(result).toBe('recovered')
    expect(cb.getState()).toBe('CLOSED')
  })

  it('HALF_OPEN에서 실패하면 다시 OPEN', async () => {
    const cb = new CircuitBreaker({
      name: 'test',
      failureThreshold: 1,
      resetTimeoutMs: 50,
    })

    await expect(
      cb.execute(async () => { throw new Error('fail') }),
    ).rejects.toThrow()

    await new Promise((r) => setTimeout(r, 100))
    expect(cb.getState()).toBe('HALF_OPEN')

    await expect(
      cb.execute(async () => { throw new Error('still-failing') }),
    ).rejects.toThrow()

    expect(cb.getState()).toBe('OPEN')
  })

  it('성공하면 실패 카운터 리셋', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 })

    // 2번 실패
    for (let i = 0; i < 2; i++) {
      await expect(
        cb.execute(async () => { throw new Error('fail') }),
      ).rejects.toThrow()
    }

    // 1번 성공 → 카운터 리셋
    await cb.execute(async () => 'ok')

    // 다시 2번 실패 → 아직 CLOSED (카운터가 리셋되었으므로)
    for (let i = 0; i < 2; i++) {
      await expect(
        cb.execute(async () => { throw new Error('fail') }),
      ).rejects.toThrow()
    }

    expect(cb.getState()).toBe('CLOSED')
  })
})
