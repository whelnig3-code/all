// =============================================
// 사전 검증 유틸리티 (Preflight Check)
// - 비유: 비행기 이륙 전 체크리스트. 엔진(Docker), 연료(환경변수),
//   활주로(포트) 상태를 모두 확인해야 안전하게 출발할 수 있다.
// =============================================

interface CheckResult {
  ok: boolean
  error?: string
}

interface PortConflictResult extends CheckResult {
  pid?: number
}

interface EnvValidationResult {
  ok: boolean
  missing: string[]
}

/** Node.js 버전이 최소 요구사항(18+)을 충족하는지 확인 */
export function checkNodeVersion(versionString: string): CheckResult {
  const match = versionString.match(/^v?(\d+)/)
  if (!match) {
    return { ok: false, error: `버전 파싱 실패: ${versionString}` }
  }

  const major = parseInt(match[1], 10)
  if (major < 18) {
    return {
      ok: false,
      error: `Node.js 18 이상 필요 (현재: ${versionString})`,
    }
  }

  return { ok: true }
}

/** .env 파일 내 PORT 값이 기대 포트와 일치하는지 확인 */
export function checkEnvPort(envContent: string, expectedPort: number): CheckResult {
  const lines = envContent.split('\n')
  const portLine = lines.find((line) => line.startsWith('PORT='))

  if (!portLine) {
    return { ok: false, error: 'PORT 항목이 .env 파일에 없습니다' }
  }

  const actualPort = parseInt(portLine.split('=')[1], 10)
  if (actualPort !== expectedPort) {
    return {
      ok: false,
      error: `.env PORT=${actualPort} → 기대값 PORT=${expectedPort}. 수정 필요`,
    }
  }

  return { ok: true }
}

/** netstat 출력에서 특정 포트가 LISTENING 상태인지 감지 */
export function detectPortConflict(
  port: number,
  netstatLines: string[],
): PortConflictResult {
  const portPattern = new RegExp(`:${port}\\s`)

  for (const line of netstatLines) {
    if (portPattern.test(line) && line.includes('LISTENING')) {
      const parts = line.trim().split(/\s+/)
      const pid = parseInt(parts[parts.length - 1], 10)
      return {
        ok: false,
        error: `포트 ${port}이(가) 이미 사용 중 (PID: ${pid})`,
        pid: isNaN(pid) ? undefined : pid,
      }
    }
  }

  return { ok: true }
}

/** .env 파일에 필수 키가 모두 존재하는지 검증 */
export function validateEnvFile(
  content: string,
  requiredKeys: string[],
): EnvValidationResult {
  const lines = content.split('\n')
  const presentKeys = new Set<string>()

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const key = trimmed.split('=')[0]
    presentKeys.add(key)
  }

  const missing = requiredKeys.filter((key) => !presentKeys.has(key))

  return {
    ok: missing.length === 0,
    missing,
  }
}
