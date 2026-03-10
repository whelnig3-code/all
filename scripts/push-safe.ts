// =============================================
// db:push-safe — 크로스 플랫폼 안전 마이그레이션 스크립트
//
// PowerShell의 && 연산자 미지원 문제를 우회.
// Node.js execSync로 순차 실행:
//   1) verify-unique-key.ts  → uniqueKey 유효성 검증
//   2) npm run db:push        → Prisma 스키마 적용
//
// 실행 방법:
//   npx tsx scripts/push-safe.ts
//
// 주의:
//   1단계 verify에서 오류가 발견되면 db:push를 실행하지 않고 종료합니다.
//   반드시 fix-unique-key.ts로 복구 후 재실행하세요.
// =============================================

import { execSync } from 'child_process'
import path from 'path'

/** execSync 옵션 — 자식 프로세스 stdout/stderr를 터미널에 그대로 출력 */
const EXEC_OPTS = {
  stdio: 'inherit' as const,
  // 모노레포 루트 기준으로 실행
  cwd: path.resolve(__dirname, '..'),
}

function run(label: string, command: string): void {
  console.log(`\n📦 ${label}`)
  console.log(`   > ${command}\n`)
  // 오류 발생 시 execSync가 예외를 throw → catch 블록에서 종료
  execSync(command, EXEC_OPTS)
}

async function main(): Promise<void> {
  console.log('🔐 db:push-safe — 안전 마이그레이션 시작\n')
  console.log('  Step 1: uniqueKey 유효성 검증')
  console.log('  Step 2: Prisma 스키마 적용 (db:push)\n')

  try {
    // Step 1 — uniqueKey 검증 (빈 값 발견 시 exit(1) → 예외 throw)
    run('Step 1: uniqueKey 유효성 검증', 'npx tsx scripts/verify-unique-key.ts')

    // Step 2 — DB 스키마 적용 (Step 1 통과 시에만 실행)
    run('Step 2: Prisma 스키마 적용', 'npm run db:push -w packages/db')

    console.log('\n✅ db:push-safe 완료 — 스키마가 안전하게 적용되었습니다.')
  } catch {
    // execSync는 자식 프로세스가 exit(1)이면 예외를 throw
    console.error('\n⛔ db:push-safe 실패 — 위의 오류를 확인하세요.')
    console.error('   uniqueKey 오류라면: npx tsx scripts/fix-unique-key.ts 실행 후 재시도')
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error('push-safe 스크립트 오류:', err)
  process.exit(1)
})
