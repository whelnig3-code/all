// =============================================
// Basic Auth 헬퍼 (공유)
// =============================================

/**
 * Authorization 헤더에서 Basic Auth 자격증명 검증
 * base64 디코딩 → user:pass 비교
 */
export function verifyBasicAuth(authHeader: string | undefined): boolean {
  if (!authHeader?.startsWith('Basic ')) return false
  try {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8')
    const colonIdx = decoded.indexOf(':')
    if (colonIdx === -1) return false
    const user = decoded.slice(0, colonIdx)
    const pass = decoded.slice(colonIdx + 1)
    return (
      user === process.env['ADMIN_USER'] &&
      pass === process.env['ADMIN_PASS']
    )
  } catch {
    return false
  }
}
