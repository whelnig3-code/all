// =============================================
// 호환성 표 생성기
//
// 비유: 프린터 잉크 매장의 "프린터 모델별 호환 잉크 표".
// 공구 소모품도 마찬가지 — "이 비트가 내 드릴에 맞나?"가
// 구매 결정의 90%를 차지한다.
//
// 알리/테무에서는 절대 제공하지 않는 정보.
// =============================================

export interface CompatibilityInput {
  readonly specs?: ReadonlyArray<readonly [string, string]>
  readonly productName?: string
}

/** 척 사이즈 → 호환 기기 매핑 */
const CHUCK_COMPATIBILITY: Record<string, readonly string[]> = {
  '13mm': [
    '보쉬 GSB/GSR 시리즈 (13mm 척)',
    '마키타 HP/DF 시리즈 (13mm 척)',
    '디월트 DCD 시리즈 (13mm 척)',
    '계양/아임삭 일반 13mm 척 전 모델',
    '밀워키 M18 시리즈 (13mm 척)',
  ],
  '10mm': [
    '보쉬 GSR 10.8V 시리즈 (10mm 척)',
    '마키타 DF 10.8V 시리즈 (10mm 척)',
    '일반 가정용 드릴 대부분 (10mm 척)',
  ],
}

/** SDS 타입 → 호환 기기 */
const SDS_COMPATIBILITY: readonly string[] = [
  '보쉬 GBH 시리즈 (SDS-Plus 해머드릴)',
  '마키타 HR 시리즈 (SDS-Plus 해머드릴)',
  '디월트 DCH 시리즈 (SDS-Plus 해머드릴)',
  '힐티 TE 시리즈 (SDS-Plus)',
  '모든 SDS-Plus 규격 해머드릴 호환',
]

/** 디스크 직경 → 호환 그라인더 */
const DISC_COMPATIBILITY: Record<string, { label: string; tools: readonly string[] }> = {
  '100': {
    label: '4인치',
    tools: [
      '보쉬 GWS 시리즈 (4인치 그라인더)',
      '마키타 GA 시리즈 (100mm)',
      '디월트 DWE 시리즈 (4인치)',
      '계양/아임삭 4인치 그라인더 전 모델',
      '대부분의 100mm(4인치) 앵글 그라인더',
    ],
  },
  '125': {
    label: '5인치',
    tools: [
      '보쉬 GWS 125 시리즈 (5인치)',
      '마키타 GA5 시리즈 (125mm)',
      '대부분의 125mm(5인치) 앵글 그라인더',
    ],
  },
  '180': {
    label: '7인치',
    tools: [
      '7인치(180mm) 대형 앵글 그라인더',
      '보쉬 GWS 180 시리즈',
    ],
  },
}

/** 상품명에서 규격 패턴 추출 */
function extractSpecsFromName(name: string): Array<[string, string]> {
  const specs: Array<[string, string]> = []

  // 4인치, 5인치 → 디스크 직경
  const inchMatch = name.match(/(\d+)\s*인치/)
  if (inchMatch) {
    const inchToMm: Record<string, string> = { '4': '100', '5': '125', '7': '180' }
    const mm = inchToMm[inchMatch[1]]
    if (mm) specs.push(['직경', `${mm}mm`])
  }

  // 100mm, 125mm → 직경
  const mmMatch = name.match(/(100|125|180)\s*mm/i)
  if (mmMatch && !specs.some(([k]) => k === '직경')) {
    specs.push(['직경', `${mmMatch[1]}mm`])
  }

  // SDS
  if (/sds/i.test(name)) {
    specs.push(['생크', 'SDS'])
  }

  // 13mm 척, 10mm 척
  const chuckMatch = name.match(/(10|13)\s*mm\s*척/)
  if (chuckMatch) {
    specs.push(['척', `${chuckMatch[1]}mm`])
  }

  return specs
}

/**
 * 호환성 표 HTML 생성
 *
 * @returns 호환 정보가 있으면 HTML, 없으면 빈 문자열
 */
export function generateCompatibilityTable(input: CompatibilityInput): string {
  const allSpecs = [
    ...(input.specs ?? []),
    ...(input.productName ? extractSpecsFromName(input.productName) : []),
  ]

  if (allSpecs.length === 0) return ''

  const compatItems: string[] = []

  for (const [key, value] of allSpecs) {
    // 척 사이즈
    if (key === '척') {
      const size = value.replace(/mm/i, '').trim() + 'mm'
      const tools = CHUCK_COMPATIBILITY[size]
      if (tools) {
        compatItems.push(...tools)
      }
    }

    // SDS 생크
    if (key === '생크' && /sds/i.test(value)) {
      compatItems.push(...SDS_COMPATIBILITY)
    }

    // 디스크 직경
    if (key === '직경') {
      const mm = value.replace(/mm/i, '').trim()
      const disc = DISC_COMPATIBILITY[mm]
      if (disc) {
        compatItems.push(`${disc.label}(${mm}mm) 호환 그라인더:`)
        compatItems.push(...disc.tools)
      }
    }
  }

  if (compatItems.length === 0) return ''

  const rowsHtml = compatItems
    .map((item) => {
      const isHeader = item.endsWith(':')
      if (isHeader) {
        return `<tr><td colspan="2" style="padding:10px 12px;background:#e8f5e9;font-weight:600;border:1px solid #eee;">${item.replace(/:$/, '')}</td></tr>`
      }
      return `<tr><td style="padding:6px 12px;border:1px solid #eee;width:20px;">✅</td><td style="padding:6px 12px;border:1px solid #eee;">${item}</td></tr>`
    })
    .join('')

  return (
    `<div style="max-width:860px;margin:0 auto;padding:20px 0;border-top:1px solid #eee;">` +
    `<h2 style="font-size:18px;font-weight:600;margin:0 0 12px;">호환 기기 안내</h2>` +
    `<table style="width:100%;border-collapse:collapse;">${rowsHtml}</table>` +
    `</div>`
  )
}
