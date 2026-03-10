// =============================================
// FAQ 자동 생성기
//
// 비유: 오프라인 매장 직원이 자주 받는 질문을 미리 정리해둔 것.
// "이 비트가 제 드릴에 맞나요?" — 매일 10번은 듣는 질문.
// 상세페이지에 미리 답해두면 문의도 줄고, 신뢰도 올라간다.
// =============================================

interface FaqItem {
  readonly question: string
  readonly answer: string
}

export interface FaqInput {
  readonly category?: string
  readonly specs?: ReadonlyArray<readonly [string, string]>
}

/** 카테고리별 사전 정의 FAQ */
const CATEGORY_FAQS: ReadonlyArray<{
  keywords: readonly string[]
  faqs: readonly FaqItem[]
}> = [
  {
    keywords: ['드릴비트', '비트', '드릴'],
    faqs: [
      {
        question: '이 비트가 제 드릴에 맞나요?',
        answer: '상단 호환성 표에서 척 사이즈(10mm/13mm)와 생크 타입(원형/육각/SDS)을 확인해주세요. 척 사이즈가 같으면 대부분 호환됩니다.',
      },
      {
        question: 'HSS와 코발트 비트 차이가 뭔가요?',
        answer: 'HSS는 일반 금속/나무용, 코발트는 스테인리스/경합금 같은 단단한 금속용입니다. HSS로 안 뚫리면 코발트로 교체하세요.',
      },
      {
        question: '한 세트에 몇 개 들어있나요?',
        answer: '상품 옵션의 구성을 확인해주세요. 세트 상품은 사이즈별 구성이 명시되어 있습니다.',
      },
      {
        question: '내구성은 어느 정도인가요?',
        answer: 'HSS 기준 일반 금속 50~200회 사용 가능합니다. 사용 조건(재질, 압력, 냉각)에 따라 달라집니다.',
      },
    ],
  },
  {
    keywords: ['그라인더', '디스크', '절단석', '연마'],
    faqs: [
      {
        question: '제 그라인더에 맞는 디스크인가요?',
        answer: '디스크 직경(100mm=4인치, 125mm=5인치)과 내경(보통 16mm)을 확인해주세요. 대부분의 앵글 그라인더는 같은 직경이면 호환됩니다.',
      },
      {
        question: '절단용과 연마용 차이가 뭔가요?',
        answer: '절단 디스크는 얇고(1~1.6mm) 절단 전용, 연마 디스크는 두껍고(6mm+) 표면 연삭용입니다. 절단 디스크로 연마하면 파손 위험이 있습니다.',
      },
      {
        question: '몇 장이나 들어있나요?',
        answer: '상품 옵션에서 수량을 확인해주세요. 대용량 세트가 장당 단가가 훨씬 저렴합니다.',
      },
    ],
  },
  {
    keywords: ['절단날', '톱날', '원형톱'],
    faqs: [
      {
        question: '제 톱에 맞는 날인가요?',
        answer: '톱날 직경과 내경(보통 25.4mm)을 확인해주세요. 직경이 같고 내경이 맞으면 대부분 호환됩니다.',
      },
      {
        question: '이빨 수(T)가 뭔가요?',
        answer: '이빨 수가 적을수록(24T) 빠른 거친 절단, 많을수록(60T) 느리지만 깨끗한 절단입니다.',
      },
    ],
  },
  {
    keywords: ['샌딩', '사포', '연마지'],
    faqs: [
      {
        question: '어떤 번수를 써야 하나요?',
        answer: '#40~60은 거친 제거, #80~120은 기본 연마, #150~220은 마감 전, #320+는 최종 마감입니다.',
      },
    ],
  },
]

/** 기본 FAQ (모든 상품 공통) */
const DEFAULT_FAQS: readonly FaqItem[] = [
  {
    question: '배송은 얼마나 걸리나요?',
    answer: '평일 오후 2시 전 주문 시 당일 출고됩니다. 출고 후 1~2영업일 내 수령 가능합니다.',
  },
  {
    question: '교환/반품이 가능한가요?',
    answer: '수령 후 7일 이내 교환/반품 가능합니다. 규격 불일치 시 반품 배송비는 당사가 부담합니다.',
  },
]

/** 스펙 기반 동적 FAQ 생성 */
function generateSpecFaqs(specs: ReadonlyArray<readonly [string, string]>): FaqItem[] {
  const faqs: FaqItem[] = []

  for (const [key, value] of specs) {
    if (key === '재질') {
      faqs.push({
        question: `${value} 재질의 특징은 무엇인가요?`,
        answer: `${value} 소재를 사용하여 내구성과 작업 효율이 우수합니다. 상세 스펙은 제품 사양 표를 참고해주세요.`,
      })
    }
    if (key === '직경' || key === '사이즈') {
      faqs.push({
        question: `${value} 규격이 제 장비에 맞나요?`,
        answer: `${value} 규격입니다. 장비의 호환 규격을 확인해주세요. 호환성 표를 참고하시면 편리합니다.`,
      })
    }
  }

  return faqs
}

/**
 * FAQ HTML 생성
 */
export function generateFaqHtml(input: FaqInput): string {
  const category = input.category ?? ''
  const lower = category.toLowerCase()

  // 카테고리별 FAQ
  let categoryFaqs: readonly FaqItem[] = []
  for (const entry of CATEGORY_FAQS) {
    if (entry.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      categoryFaqs = entry.faqs
      break
    }
  }

  // 스펙 기반 FAQ
  const specFaqs = input.specs ? generateSpecFaqs(input.specs) : []

  // 합산: 카테고리 + 스펙 + 기본
  const allFaqs = [...categoryFaqs, ...specFaqs, ...DEFAULT_FAQS]

  const faqHtml = allFaqs
    .map(
      (faq) =>
        `<div style="margin:12px 0;">` +
        `<p style="font-size:15px;font-weight:600;color:#2d3436;margin:0 0 4px;">Q. ${faq.question}</p>` +
        `<p style="font-size:14px;color:#636e72;margin:0 0 0 20px;">A. ${faq.answer}</p>` +
        `</div>`,
    )
    .join('')

  return (
    `<div style="max-width:860px;margin:0 auto;padding:20px 0;border-top:1px solid #eee;">` +
    `<h2 style="font-size:18px;font-weight:600;margin:0 0 12px;">자주 묻는 질문</h2>` +
    faqHtml +
    `</div>`
  )
}
