// =============================================
// env-guard 단위 테스트
// ADMIN_PASS 보안 검증 함수
// =============================================

import { validateAdminPassword } from './env-guard'

describe('validateAdminPassword', () => {
  // 원래 환경변수 보존
  let savedPass: string | undefined

  beforeEach(() => {
    savedPass = process.env['ADMIN_PASS']
  })

  afterEach(() => {
    // 테스트 후 환경변수 원상 복구
    if (savedPass === undefined) {
      delete process.env['ADMIN_PASS']
    } else {
      process.env['ADMIN_PASS'] = savedPass
    }
  })

  it('ADMIN_PASS 미설정(undefined) → [SECURITY] 에러 발생', () => {
    delete process.env['ADMIN_PASS']
    expect(() => validateAdminPassword()).toThrow('[SECURITY]')
  })

  it('ADMIN_PASS 빈 문자열 → [SECURITY] 에러 발생', () => {
    process.env['ADMIN_PASS'] = ''
    expect(() => validateAdminPassword()).toThrow('[SECURITY]')
  })

  it('ADMIN_PASS === "changeme" → [SECURITY] 에러 발생', () => {
    process.env['ADMIN_PASS'] = 'changeme'
    expect(() => validateAdminPassword()).toThrow('[SECURITY]')
  })

  it('강력한 ADMIN_PASS → 에러 없이 통과', () => {
    process.env['ADMIN_PASS'] = 'super$ecureP@ss123!'
    expect(() => validateAdminPassword()).not.toThrow()
  })
})
