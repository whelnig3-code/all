// =============================================
// uniqueKey 자동 수정 스크립트
//
// 빈 uniqueKey를 "{source}:{sourceProductId}" 형식으로 자동 복구합니다.
// verify-unique-key.ts 실행 후 오류가 있을 때만 실행하세요.
//
// 실행 방법:
//   npx tsx scripts/fix-unique-key.ts
//
// 권장 순서:
//   1. npx tsx scripts/verify-unique-key.ts  → 오류 확인
//   2. npx tsx scripts/fix-unique-key.ts     → 자동 수정
//   3. npx tsx scripts/verify-unique-key.ts  → 재검증 (반드시 통과해야 함)
//   4. npm run db:push                        → 스키마 적용
// =============================================

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  console.log('🔧 빈 uniqueKey 자동 수정 시작...\n')

  const invalid = await prisma.product.findMany({
    where: { uniqueKey: '' },
    select: {
      id: true,
      source: true,
      sourceProductId: true,
      status: true,
    },
  })

  if (invalid.length === 0) {
    console.log('✅ 수정이 필요한 상품 없음 — 모든 uniqueKey가 유효합니다.')
    return
  }

  console.log(`📋 수정 대상: ${invalid.length}개`)

  let fixed = 0
  let skipped = 0

  for (const p of invalid) {
    // source 또는 sourceProductId가 없으면 수정 불가
    if (!p.source || !p.sourceProductId) {
      console.warn(`  ⚠️ ${p.id}: source 또는 sourceProductId 누락 — 수동 확인 필요`)
      skipped++
      continue
    }

    const newKey = `${p.source}:${p.sourceProductId}`
    await prisma.product.update({
      where: { id: p.id },
      data: { uniqueKey: newKey },
    })
    console.log(`  ✓ ${p.id} (${p.status}) → uniqueKey: ${newKey}`)
    fixed++
  }

  console.log(`\n완료: 수정 ${fixed}개 / 스킵 ${skipped}개`)

  if (skipped > 0) {
    console.error('\n⛔ 스킵된 항목이 있습니다. 수동으로 확인 후 재실행하세요.')
    process.exit(1)
  }

  console.log('\n다음 단계:')
  console.log('  1. npx tsx scripts/verify-unique-key.ts  (재검증)')
  console.log('  2. npm run db:push                        (스키마 적용)')
}

main()
  .catch((err) => {
    console.error('수정 스크립트 실패:', err)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  })
