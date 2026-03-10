// =============================================
// 사전 검증 (Preflight Check) 테스트
// - 비유: 비행기 이륙 전 체크리스트. 엔진(Docker), 연료(환경변수),
//   활주로(포트) 상태를 모두 확인해야 안전하게 출발할 수 있다.
// =============================================

import {
  checkNodeVersion,
  checkEnvPort,
  detectPortConflict,
  validateEnvFile,
} from './preflight'

describe('Preflight Check', () => {
  describe('checkNodeVersion', () => {
    it('18.x 이상이면 통과', () => {
      expect(checkNodeVersion('v18.0.0')).toEqual({ ok: true })
      expect(checkNodeVersion('v20.11.1')).toEqual({ ok: true })
      expect(checkNodeVersion('v22.0.0')).toEqual({ ok: true })
    })

    it('18 미만이면 실패', () => {
      const result = checkNodeVersion('v16.20.0')
      expect(result.ok).toBe(false)
      expect(result.error).toContain('18')
    })

    it('잘못된 버전 문자열이면 실패', () => {
      const result = checkNodeVersion('invalid')
      expect(result.ok).toBe(false)
    })
  })

  describe('checkEnvPort', () => {
    it('PORT=3100이면 통과', () => {
      const envContent = 'DATABASE_URL=postgresql://...\nPORT=3100\nNODE_ENV=dev'
      expect(checkEnvPort(envContent, 3100)).toEqual({ ok: true })
    })

    it('PORT=3000이면 경고 반환', () => {
      const envContent = 'DATABASE_URL=postgresql://...\nPORT=3000\nNODE_ENV=dev'
      const result = checkEnvPort(envContent, 3100)
      expect(result.ok).toBe(false)
      expect(result.error).toContain('3000')
      expect(result.error).toContain('3100')
    })

    it('PORT 항목 없으면 경고', () => {
      const envContent = 'DATABASE_URL=postgresql://...\nNODE_ENV=dev'
      const result = checkEnvPort(envContent, 3100)
      expect(result.ok).toBe(false)
      expect(result.error).toContain('PORT')
    })
  })

  describe('detectPortConflict', () => {
    it('포트가 사용 중이 아니면 통과', () => {
      const netstatLines = [
        'TCP  0.0.0.0:5432  0.0.0.0:0  LISTENING  1234',
        'TCP  0.0.0.0:6379  0.0.0.0:0  LISTENING  5678',
      ]
      expect(detectPortConflict(3100, netstatLines)).toEqual({ ok: true })
    })

    it('포트가 이미 사용 중이면 PID 포함 에러', () => {
      const netstatLines = [
        'TCP  0.0.0.0:3100  0.0.0.0:0  LISTENING  9999',
      ]
      const result = detectPortConflict(3100, netstatLines)
      expect(result.ok).toBe(false)
      expect(result.error).toContain('3100')
      expect(result.pid).toBe(9999)
    })

    it('LISTENING이 아닌 상태는 무시', () => {
      const netstatLines = [
        'TCP  0.0.0.0:3100  0.0.0.0:0  TIME_WAIT  9999',
      ]
      expect(detectPortConflict(3100, netstatLines)).toEqual({ ok: true })
    })
  })

  describe('validateEnvFile', () => {
    it('필수 키가 모두 있으면 통과', () => {
      const content = [
        'DATABASE_URL=postgresql://user:password@localhost:5432/smartstore',
        'ADMIN_PASS=somesecret',
        'REDIS_HOST=localhost',
      ].join('\n')
      const requiredKeys = ['DATABASE_URL', 'ADMIN_PASS', 'REDIS_HOST']
      expect(validateEnvFile(content, requiredKeys)).toEqual({ ok: true, missing: [] })
    })

    it('빠진 키 목록 반환', () => {
      const content = 'DATABASE_URL=postgresql://...\nREDIS_HOST=localhost'
      const requiredKeys = ['DATABASE_URL', 'ADMIN_PASS', 'REDIS_HOST']
      const result = validateEnvFile(content, requiredKeys)
      expect(result.ok).toBe(false)
      expect(result.missing).toEqual(['ADMIN_PASS'])
    })

    it('빈 값도 존재로 인정', () => {
      const content = 'DATABASE_URL=\nADMIN_PASS=secret'
      const requiredKeys = ['DATABASE_URL', 'ADMIN_PASS']
      expect(validateEnvFile(content, requiredKeys)).toEqual({ ok: true, missing: [] })
    })

    it('주석 줄은 무시', () => {
      const content = '# DATABASE_URL=test\nADMIN_PASS=secret'
      const requiredKeys = ['DATABASE_URL', 'ADMIN_PASS']
      const result = validateEnvFile(content, requiredKeys)
      expect(result.ok).toBe(false)
      expect(result.missing).toEqual(['DATABASE_URL'])
    })
  })
})
