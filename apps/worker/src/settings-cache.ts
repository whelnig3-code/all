// =============================================
// 시스템 설정 캐시 (Kill Switch DB → in-memory)
//
// 동작 방식:
//   - startSettingsRefresh() 호출 시 60초마다 DB에서 갱신
//   - DB 오류 발생 시 이전 캐시 유지 (fail-safe — 자동화 중단 방지)
//   - 캐시 미스 시 기본값 "true" 반환 (자동화 활성 기본 유지)
//
// Kill Switch 값:
//   - "true"  → 자동화 활성 (정상 동작)
//   - "false" → 자동화 비활성 (일시 정지)
//
// 사용법:
//   import { getSetting, startSettingsRefresh } from '../settings-cache'
//   startSettingsRefresh()           // 워커 시작 시 1회 호출
//   getSetting('AUTO_PRICE_ENABLED') // job 핸들러에서 조회
// =============================================

import { prisma } from '@smartstore/db'
import { createLogger } from '@smartstore/shared'

const logger = createLogger('settings-cache')

/**
 * 기본값: 캐시 미스 또는 DB 연결 실패 시 반환
 * "true" → 자동화 계속 실행 (fail-safe)
 */
const DEFAULT_VALUE = 'true'

/** in-memory 설정 캐시: key → value */
let cache: Record<string, string> = {}

/** 60초 갱신 타이머 핸들 */
let refreshTimer: ReturnType<typeof setInterval> | null = null

/**
 * DB에서 SystemSetting 전체 로드 → 캐시 교체
 * 오류 발생 시 기존 캐시를 유지하고 경고 로그만 기록
 */
async function loadFromDB(): Promise<void> {
  try {
    const settings = await prisma.systemSetting.findMany()

    // 원자적 교체: 오류 없이 완료된 경우에만 캐시 갱신
    const newCache: Record<string, string> = {}
    for (const s of settings) {
      newCache[s.key] = s.value
    }
    cache = newCache

    logger.debug('시스템 설정 캐시 갱신 완료', { count: settings.length, keys: Object.keys(newCache) })
  } catch (error) {
    // DB 오류 → 이전 캐시 유지 (자동화 중단 방지)
    logger.warn('시스템 설정 DB 조회 실패 — 이전 캐시 유지 (fail-safe)', { error })
  }
}

/**
 * 캐시에서 설정값 반환
 * 캐시에 키가 없으면 기본값 "true" 반환 (자동화 활성 유지)
 *
 * @param key 설정 키 (예: 'AUTO_PRICE_ENABLED')
 * @returns 설정값 문자열 (없으면 "true")
 */
export function getSetting(key: string): string {
  return cache[key] ?? DEFAULT_VALUE
}

/**
 * 주기적 DB 갱신 시작 (워커 시작 시 1회 호출)
 * 즉시 1회 로드 후 intervalMs마다 반복 갱신
 * 이미 실행 중이면 중복 시작 방지
 *
 * @param intervalMs 갱신 주기 ms (기본 60초)
 */
export function startSettingsRefresh(intervalMs = 60_000): void {
  if (refreshTimer !== null) {
    logger.debug('설정 캐시 갱신 이미 실행 중 — 중복 시작 무시')
    return
  }

  // 즉시 1회 로드
  void loadFromDB()

  // 주기적 갱신 타이머 등록
  refreshTimer = setInterval(() => void loadFromDB(), intervalMs)
  logger.info('설정 캐시 갱신 시작', { intervalMs })
}

/**
 * 주기적 갱신 중단 (프로세스 종료 또는 테스트 cleanup 시 호출)
 */
export function stopSettingsRefresh(): void {
  if (refreshTimer !== null) {
    clearInterval(refreshTimer)
    refreshTimer = null
    logger.debug('설정 캐시 갱신 중단')
  }
}

/**
 * DB에서 즉시 강제 갱신 (설정 변경 후 즉시 반영 시 사용)
 */
export async function forceRefresh(): Promise<void> {
  await loadFromDB()
}

/** @internal 테스트 전용 — 캐시 직접 세팅 (실운영에서 호출 금지) */
export function _setSettingForTest(key: string, value: string): void {
  cache[key] = value
}

/** @internal 테스트 전용 — 캐시 전체 초기화 (실운영에서 호출 금지) */
export function _resetCacheForTest(): void {
  cache = {}
}
