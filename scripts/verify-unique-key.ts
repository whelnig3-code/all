// =============================================
// uniqueKey 검증 스크립트
//
// schema.prisma에서 uniqueKey @default("") 제거(필수 필드 전환) 전에
// 반드시 실행하여 빈 uniqueKey가 없음을 확인해야 합니다.
//
// 실행 방법:
//   npx ts-node scripts/verify-unique-key.ts
//   또는
//   npx tsx scripts/verify-unique-key.ts
//
// 이 스크립트가 exit(0)으로 성공한 후에만 다음 단계를 진행하세요:
//   npm run db:push   (schema.prisma 적용)
// =============================================

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  console.log('🔍 uniqueKey 검증 시작...')

  const invalid = await prisma.product.findMany({
    where: {
      OR: [
        { uniqueKey: '' },
        // Prisma String @default("") 는 null이 될 수 없으나 방어적 체크
        { uniqueKey: undefined },
      ],
    },
    select: {
      id: true,
      source: true,
      sourceProductId: true,
      uniqueKey: true,
      status: true,
      createdAt: true,
    },
  })

  if (invalid.length > 0) {
    console.error(`\n❌ uniqueKey가 빈 상품 ${invalid.length}개 발견:`)
    invalid.forEach((p) => {
      console.error(
        `  id=${p.id}  source=${p.source}  sourceProductId=${p.sourceProductId}  status=${p.status}  createdAt=${p.createdAt.toISOString()}`
      )
    })
    console.error(
      '\n수정 방법: 각 상품의 uniqueKey를 "{source}:{sourceProductId}" 형식으로 업데이트 후 재실행하세요.'
    )
    console.error('예시: UPDATE products SET unique_key = source || \':\' || source_product_id WHERE unique_key = \'\';')
    process.exit(1)
  }

  const total = await prisma.product.count()
  console.log(`✅ All products have valid uniqueKey (총 ${total}개 확인 완료)`)
  console.log('\n다음 단계: npm run db:push 실행 후 schema.prisma 마이그레이션 적용')
}

main()
  .catch((err) => {
    console.error('검증 스크립트 실패:', err)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  })
