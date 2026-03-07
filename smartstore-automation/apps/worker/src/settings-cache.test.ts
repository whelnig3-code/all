// =============================================
// settings-cache 단위 테스트
// DB in-memory 캐시 동작 검증
// =============================================

import {
  getSetting,
  forceRefresh,
  _setSettingForTest,
  _resetCacheForTest,
  stopSettingsRefresh,
} from './settings-cache'

// @smartstore/db prisma 모킹
jest.mock('@smartstore/db', () => ({
  prisma: {
    systemSetting: {
      findMany: jest.fn(),
    },
  },
}))

// @smartstore/shared 로거 모킹
jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

const { prisma } = jest.requireMock('@smartstore/db') as {
  prisma: { systemSetting: { findMany: jest.Mock } }
}

describe('settings-cache', () => {
  beforeEach(() => {
    _resetCacheForTest()
    stopSettingsRefresh()
    jest.clearAllMocks()
  })

  // ---- 기본 동작 ----

  it('캐시 미스 → 기본값 "true" 반환', () => {
    // 캐시 비어있는 상태에서 조회
    expect(getSetting('AUTO_PRICE_ENABLED')).toBe('true')
    expect(getSetting('AUTO_ORDER_ENABLED')).toBe('true')
    expect(getSetting('AUTO_SHIPPING_ENABLED')).toBe('true')
  })

  it('forceRefresh 후 DB 값이 캐시에 반영됨', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: 'AUTO_PRICE_ENABLED', value: 'false', updatedAt: new Date() },
      { key: 'AUTO_ORDER_ENABLED', value: 'true', updatedAt: new Date() },
    ])

    await forceRefresh()

    expect(getSetting('AUTO_PRICE_ENABLED')).toBe('false')
    expect(getSetting('AUTO_ORDER_ENABLED')).toBe('true')
    // DB에 없는 키는 기본값
    expect(getSetting('AUTO_SHIPPING_ENABLED')).toBe('true')
  })

  it('여러 설정 동시 로드 — 모두 캐시에 반영', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: 'AUTO_PRICE_ENABLED', value: 'true' },
      { key: 'AUTO_ORDER_ENABLED', value: 'false' },
      { key: 'AUTO_SHIPPING_ENABLED', value: 'false' },
    ])

    await forceRefresh()

    expect(getSetting('AUTO_PRICE_ENABLED')).toBe('true')
    expect(getSetting('AUTO_ORDER_ENABLED')).toBe('false')
    expect(getSetting('AUTO_SHIPPING_ENABLED')).toBe('false')
  })

  // ---- fail-safe: DB 오류 시 이전 캐시 유지 ----

  it('DB 오류 발생 시 이전 캐시 값 유지 (fail-safe)', async () => {
    // 1단계: 정상 로드
    _setSettingForTest('AUTO_PRICE_ENABLED', 'false')

    // 2단계: DB 오류
    prisma.systemSetting.findMany.mockRejectedValue(new Error('DB connection error'))
    await forceRefresh()

    // 이전 캐시 유지
    expect(getSetting('AUTO_PRICE_ENABLED')).toBe('false')
  })

  it('초기 캐시 비어있을 때 DB 오류 → 기본값 "true" 반환', async () => {
    prisma.systemSetting.findMany.mockRejectedValue(new Error('DB error'))
    await forceRefresh()

    // 캐시 비어있으니 기본값
    expect(getSetting('AUTO_PRICE_ENABLED')).toBe('true')
  })

  // ---- 테스트 헬퍼 ----

  it('_setSettingForTest — 캐시 직접 세팅', () => {
    _setSettingForTest('AUTO_ORDER_ENABLED', 'false')
    expect(getSetting('AUTO_ORDER_ENABLED')).toBe('false')
  })

  it('_resetCacheForTest — 캐시 전체 초기화 후 기본값 반환', () => {
    _setSettingForTest('AUTO_PRICE_ENABLED', 'false')
    _resetCacheForTest()
    expect(getSetting('AUTO_PRICE_ENABLED')).toBe('true')
  })

  // ---- DB findMany 호출 횟수 ----

  it('forceRefresh 2회 호출 → findMany 2회 호출', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([])
    await forceRefresh()
    await forceRefresh()
    expect(prisma.systemSetting.findMany).toHaveBeenCalledTimes(2)
  })
})
