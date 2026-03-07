// =============================================
// 사전 검증 CLI 스크립트
// - PowerShell 런처에서 호출: npx tsx scripts/preflight-check.ts
// - 종료 코드: 0=통과, 1=실패
// =============================================

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { checkNodeVersion, checkEnvPort, validateEnvFile } from '@smartstore/shared'

const ROOT = path.resolve(__dirname, '..')
const ENV_PATH = path.join(ROOT, '.env')
const EXPECTED_PORT = 3100

const REQUIRED_ENV_KEYS = [
  'DATABASE_URL',
  'ADMIN_PASS',
  'REDIS_HOST',
  'NODE_ENV',
]

let hasError = false

function ok(msg: string) {
  console.log(`  [OK] ${msg}`)
}

function fail(msg: string) {
  console.error(`  [X] ${msg}`)
  hasError = true
}

function warn(msg: string) {
  console.warn(`  [!] ${msg}`)
}

// 1. Node.js 버전 확인
const nodeResult = checkNodeVersion(process.version)
if (nodeResult.ok) {
  ok(`Node.js ${process.version}`)
} else {
  fail(nodeResult.error!)
}

// 2. npm 확인
try {
  const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim()
  ok(`npm ${npmVersion}`)
} catch {
  fail('npm이 설치되지 않았습니다')
}

// 3. Docker 확인
try {
  execSync('docker info', { encoding: 'utf-8', stdio: 'pipe' })
  ok('Docker 실행 중')
} catch {
  warn('Docker가 실행되지 않았습니다. 서비스 시작 전 Docker를 시작하세요.')
}

// 4. .env 파일 확인
if (fs.existsSync(ENV_PATH)) {
  const envContent = fs.readFileSync(ENV_PATH, 'utf-8')

  // 포트 확인
  const portResult = checkEnvPort(envContent, EXPECTED_PORT)
  if (portResult.ok) {
    ok(`PORT=${EXPECTED_PORT}`)
  } else {
    fail(portResult.error!)
  }

  // 필수 키 확인
  const envResult = validateEnvFile(envContent, REQUIRED_ENV_KEYS)
  if (envResult.ok) {
    ok('필수 환경변수 확인 완료')
  } else {
    fail(`누락된 환경변수: ${envResult.missing.join(', ')}`)
  }
} else {
  warn('.env 파일 없음 — setup-env.ps1로 자동 생성됩니다')
}

// 결과 요약
if (hasError) {
  console.error('\n  사전 검증 실패. 위 오류를 수정 후 다시 시도하세요.')
  process.exit(1)
} else {
  ok('사전 검증 통과')
  process.exit(0)
}
