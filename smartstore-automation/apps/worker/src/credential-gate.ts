// =============================================
// 자격증명 게이트 체크
// - 워커 processor 시작 시 필수 자격증명 확인
// - 미설정 시 작업을 건너뛰고 skipped 반환
// =============================================

import { isServiceReady, type ServiceType } from '@smartstore/core'
import { createLogger } from '@smartstore/shared'

const logger = createLogger('credential-gate')

export interface GateResult {
  passed: boolean
  missing: ServiceType[]
}

/**
 * 필수 서비스 자격증명이 모두 설정되었는지 확인
 *
 * @param required 필수 서비스 목록
 * @returns { passed: true } 이면 통과, false이면 missing에 미설정 서비스 목록
 */
export async function checkCredentialGate(
  required: ServiceType[],
): Promise<GateResult> {
  const missing: ServiceType[] = []

  for (const service of required) {
    const ready = await isServiceReady(service)
    if (!ready) {
      missing.push(service)
    }
  }

  if (missing.length > 0) {
    logger.warn('자격증명 미설정 — 작업 건너뜀', { missing })
  }

  return { passed: missing.length === 0, missing }
}

/**
 * 게이트 실패 시 반환할 표준 결과 객체
 */
export function gateSkipResult(missing: ServiceType[]) {
  return {
    skipped: true,
    reason: 'credentials_not_configured',
    missingServices: missing,
  }
}
