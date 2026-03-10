// =============================================
// 수량 가이드 + 안전 경고 생성기
//
// 비유: 마트의 "대용량이 이득!" POP 사인.
// "절단석 1매로 30분 → 주 3회면 월 24매 → 50매 세트가 이득"
// 이런 안내가 있으면 객단가가 자연스럽게 올라간다.
//
// 안전 경고: 법적 보호 + 전문성 시그널
// =============================================

interface QuantityGuideEntry {
  readonly keywords: readonly string[]
  readonly content: string
}

interface SafetyWarningEntry {
  readonly keywords: readonly string[]
  readonly warnings: readonly string[]
}

const QUANTITY_GUIDES: readonly QuantityGuideEntry[] = [
  {
    keywords: ['그라인더', '절단석', '절단 디스크', '연마 디스크', '디스크'],
    content:
      '<p style="font-size:14px;color:#555;margin:8px 0;">' +
      '일반 철재 작업 기준, 절단 디스크 1매당 약 <strong>20~40분</strong> 사용 가능합니다.</p>' +
      '<p style="font-size:14px;color:#555;margin:8px 0;">' +
      '주 3회 작업 시 월 약 <strong>12~24매</strong> 소모 → ' +
      '<strong style="color:#e74c3c;">대용량 세트 구매 추천</strong> (낱개 대비 30~40% 절약)</p>',
  },
  {
    keywords: ['드릴비트', '비트세트', '비트 세트'],
    content:
      '<p style="font-size:14px;color:#555;margin:8px 0;">' +
      'HSS 비트 기준, 일반 금속 작업 시 <strong>50~200회</strong> 사용 후 교체를 권장합니다.</p>' +
      '<p style="font-size:14px;color:#555;margin:8px 0;">' +
      '절삭력이 떨어지면 무리하게 사용하지 마시고 교체하세요. (무리 사용 시 공구 손상 위험)</p>',
  },
  {
    keywords: ['샌딩', '사포', '연마지'],
    content:
      '<p style="font-size:14px;color:#555;margin:8px 0;">' +
      '목재 연마 기준, 사포 1매당 약 <strong>0.5~1㎡</strong> 연마 가능합니다.</p>' +
      '<p style="font-size:14px;color:#555;margin:8px 0;">' +
      '가구 1개 작업 시 약 <strong>5~10매</strong> 필요 → ' +
      '<strong style="color:#e74c3c;">번수별 혼합 세트 추천</strong></p>',
  },
  {
    keywords: ['절단날', '톱날', '원형톱'],
    content:
      '<p style="font-size:14px;color:#555;margin:8px 0;">' +
      '원형톱날은 재연마 없이 <strong>합판 기준 약 500~1000컷</strong> 사용 가능합니다.</p>' +
      '<p style="font-size:14px;color:#555;margin:8px 0;">' +
      '절단면이 거칠어지면 교체 시기입니다. 용도별(목재/금속) 2종 세트 추천합니다.</p>',
  },
]

const SAFETY_WARNINGS: readonly SafetyWarningEntry[] = [
  {
    keywords: ['그라인더', '절단석', '절단 디스크', '연마', '디스크'],
    warnings: [
      '사용 전 반드시 보안경, 장갑, 안면보호대를 착용하세요.',
      '디스크의 최대 허용 회전수(RPM)를 확인하고, 공구의 회전수를 초과하지 마세요.',
      '파손된 디스크는 절대 사용하지 마세요. 비산 위험이 있습니다.',
      '절단 작업 시 주의: 불꽃 방향을 확인하고 가연물을 제거하세요.',
    ],
  },
  {
    keywords: ['드릴비트', '비트', '드릴'],
    warnings: [
      '작업 시 보안경을 반드시 착용하세요. (칩/파편 비산 위험)',
      '장갑은 회전 공구 사용 시 말림 위험이 있으므로 주의하세요.',
      '관통 직전 이송 속도를 줄여 파손을 방지하세요.',
    ],
  },
  {
    keywords: ['절단날', '톱날', '원형톱'],
    warnings: [
      '톱날 교체 시 반드시 전원을 차단하세요.',
      '회전 방향 화살표를 확인 후 장착하세요.',
      '보안경, 방진마스크를 착용하세요.',
    ],
  },
]

/**
 * 수량 가이드 HTML 생성
 */
export function generateQuantityGuide(nameOrCategory: string): string {
  const lower = nameOrCategory.toLowerCase()

  for (const entry of QUANTITY_GUIDES) {
    if (entry.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return (
        `<div style="max-width:860px;margin:0 auto;padding:20px 0;border-top:1px solid #eee;">` +
        `<h2 style="font-size:18px;font-weight:600;margin:0 0 12px;">` +
        `사용량 & 수량 가이드</h2>` +
        entry.content +
        `</div>`
      )
    }
  }

  return ''
}

/**
 * 안전 경고 HTML 생성
 */
export function generateSafetyWarning(nameOrCategory: string): string {
  const lower = nameOrCategory.toLowerCase()

  for (const entry of SAFETY_WARNINGS) {
    if (entry.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      const warningsHtml = entry.warnings
        .map((w) => `<li style="padding:4px 0;font-size:13px;color:#c0392b;">${w}</li>`)
        .join('')

      return (
        `<div style="max-width:860px;margin:0 auto;padding:20px 0;border-top:1px solid #eee;">` +
        `<h2 style="font-size:18px;font-weight:600;margin:0 0 12px;color:#e74c3c;">` +
        `안전 주의사항</h2>` +
        `<ul style="list-style:none;padding:0;margin:0;">${warningsHtml}</ul>` +
        `</div>`
      )
    }
  }

  return ''
}
