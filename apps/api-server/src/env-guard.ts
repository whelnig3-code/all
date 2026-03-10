// =============================================
// 서버 시작 전 환경변수 보안 검증
//
// 목적:
//   - ADMIN_PASS 기본값("changeme") 사용 차단
//   - 미설정 상태로 서버 기동 방지
//
// 사용:
//   validateAdminPassword()를 main() 진입 직후 호출
// =============================================

/**
 * ADMIN_PASS 보안 검증
 *
 * 다음 조건에서 Error throw:
 *   - ADMIN_PASS가 미설정 (undefined / 빈 문자열)
 *   - ADMIN_PASS가 기본값 "changeme"
 *
 * @throws Error  보안 기준 미충족 시
 */
export function validateAdminPassword(): void {
  const pass = process.env['ADMIN_PASS']

  if (!pass || pass === 'changeme') {
    throw new Error(
      '[SECURITY] ADMIN_PASS must be set to a strong value before starting the server. ' +
        'The default "changeme" is not allowed. ' +
        'Please update your .env file: ADMIN_PASS=<strong-password>'
    )
  }
}
