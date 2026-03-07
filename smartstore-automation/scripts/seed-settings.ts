// =============================================
// 시스템 설정 기본값 삽입 스크립트
//
// Kill Switch 기본값을 DB에 삽입합니다.
// 이미 존재하는 키는 값을 변경하지 않습니다 (멱등성 보장).
//
// 실행 방법:
//   npm run db:seed-settings
//   또는: npx tsx scripts/seed-settings.ts
//
// 권장 순서:
//   1. npm run db:push         → 스키마 적용 (SystemSetting 모델 포함)
//   2. npm run db:seed-settings → 기본값 삽입
// =============================================

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/** Kill Switch 기본값 목록 (기본 전체 활성화) */
const DEFAULT_SETTINGS = [
  { key: 'AUTO_PRICE_ENABLED', value: 'true', desc: '가격 자동 조정' },
  { key: 'AUTO_ORDER_ENABLED', value: 'true', desc: '주문 자동 처리' },
  { key: 'AUTO_SHIPPING_ENABLED', value: 'true', desc: '배송 자동 알림' },
  { key: 'AUTO_INVENTORY_SYNC_ENABLED', value: 'true', desc: '재고 자동 동기화' },
  { key: 'ORDER_APPROVAL_MODE', value: 'false', desc: '주문 승인 모드 (false=자동, true=수동 승인)' },
] as const

async function main(): Promise<void> {
  console.log('🌱 시스템 설정 기본값 삽입 시작...\n')

  let created = 0
  let skipped = 0

  for (const setting of DEFAULT_SETTINGS) {
    const existing = await prisma.systemSetting.findUnique({
      where: { key: setting.key },
    })

    if (existing) {
      console.log(`  ✓ 이미 존재: ${setting.key} = "${existing.value}" (${setting.desc})`)
      skipped++
    } else {
      await prisma.systemSetting.create({
        data: { key: setting.key, value: setting.value },
      })
      console.log(`  ✓ 삽입됨:   ${setting.key} = "${setting.value}" (${setting.desc})`)
      created++
    }
  }

  console.log(`\n✅ 완료: 삽입 ${created}개 / 스킵 ${skipped}개`)
  console.log('\n다음 단계: npm run db:push → workers 재시작')
}

main()
  .catch((err: unknown) => {
    console.error('seed-settings 실패:', err)
    process.exit(1)
  })
  .finally(() => void prisma.$disconnect())
