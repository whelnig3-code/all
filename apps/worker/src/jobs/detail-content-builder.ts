// =============================================
// 상세 HTML 생성 모듈 (v2 — 차별화 엔진 통합)
//
// 구조:
//   USP 배너 → 이미지 → 호환성표 → 구매가이드 →
//   수량가이드 → 스펙 테이블 → FAQ → 안전경고 →
//   배송/반품 → 리뷰유도 → 키워드 → 푸터
//
// 도매꾹 상세 데이터가 없으면 이미지+원문 fallback
// =============================================

import axios from 'axios'
import { createLogger } from '@smartstore/shared'
import {
  generateUspBanner,
  getBuyingGuideHtml,
  generateCompatibilityTable,
  generateQuantityGuide,
  generateSafetyWarning,
  generateFaqHtml,
} from '@smartstore/core'

const logger = createLogger('detail-content-builder')

/** 상세 HTML 생성 옵션 */
export interface DetailHtmlOptions {
  readonly boostMode?: boolean
  readonly category?: string
}

/**
 * 도매꾹 getItemView API로 상세 데이터 조회
 * 실패 시 null 반환 (fail-open)
 */
export async function fetchDomeggookDetail(sourceProductId: string): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.DOMEGGOOK_API_KEY
  if (!apiKey || !sourceProductId) return null

  try {
    const params = new URLSearchParams({
      ver: '4.5', mode: 'getItemView', aid: apiKey,
      no: sourceProductId, om: 'json',
    })
    const res = await axios.get(`https://domeggook.com/ssl/api/?${params}`, { timeout: 8000 })
    return (res.data?.domeggook as Record<string, unknown>) ?? null
  } catch {
    logger.warn('도매꾹 상세 데이터 조회 실패 (fallback 사용)', { sourceProductId })
    return null
  }
}

/**
 * 상품명에서 스펙 패턴 추출 (재질, 사이즈, 출력, 용량 등)
 */
export function extractSpecsFromTitle(title: string): Array<[string, string]> {
  const specs: Array<[string, string]> = []
  const patterns: Array<{ label: string; regex: RegExp }> = [
    { label: '재질', regex: /(스테인리스|스틸|알루미늄|합금|크롬바나듐|탄소강|나일론|실리콘|PVC|ABS|PP|PE|목재|원목|대나무|가죽|면|폴리에스터|메쉬|옥스포드)/i },
    { label: '사이즈', regex: /(\d+(?:\.\d+)?\s*(?:mm|cm|m|인치|inch))/i },
    { label: '길이', regex: /(\d+(?:\.\d+)?\s*[Mm])\b/ },
    { label: '용량', regex: /(\d+(?:,\d+)?\s*(?:mAh|mah|ml|ML|L|리터))/i },
    { label: '출력', regex: /(\d+(?:\.\d+)?\s*[Ww])\b/ },
    { label: '전압', regex: /(\d+(?:\.\d+)?\s*[Vv])\b/ },
    { label: '포트', regex: /(\d+포트|\d+port)/i },
    { label: '구성', regex: /(\d+종|\d+개입|\d+p|\d+pcs|\d+세트)/i },
  ]
  for (const { label, regex } of patterns) {
    const match = title.match(regex)
    if (match) specs.push([label, match[1]])
  }
  return specs
}

/**
 * 스펙 테이블 추출 (API + 상품명 + 옵션 + 카테고리)
 */
function extractAllSpecs(
  name: string,
  d: Record<string, unknown>,
): Array<[string, string]> {
  const specs: Array<[string, string]> = []

  // API 데이터
  const detail = d.detail as Record<string, unknown> | undefined
  if (detail) {
    if (detail.manufacturer && detail.manufacturer !== '해당없음') specs.push(['제조사', String(detail.manufacturer)])
    if (detail.model && detail.model !== '해당없음') specs.push(['모델명', String(detail.model)])
    if (detail.country) specs.push(['원산지', String(detail.country).replace(/_/g, ' ')])
    if (detail.size && detail.size !== '.' && detail.size !== '1') specs.push(['사이즈', String(detail.size)])
    if (detail.weight && detail.weight !== '.' && detail.weight !== '1') specs.push(['무게', String(detail.weight)])
    const certs = (detail.safetyCert ?? []) as Array<Record<string, string>>
    for (const cert of certs) {
      if (cert.cert === 'Y' && cert.no) {
        specs.push([cert.certName ?? '안전인증', cert.no])
      }
    }
  }

  // 상품명 패턴 추출 (중복 제거)
  const titleSpecs = extractSpecsFromTitle(name)
  for (const [label, value] of titleSpecs) {
    if (!specs.some(([k]) => k === label)) specs.push([label, value])
  }

  // 옵션 정보
  const selectOpt = d.selectOpt
  if (selectOpt) {
    try {
      const opt = typeof selectOpt === 'string' ? JSON.parse(selectOpt) : selectOpt
      const sets = (opt?.set ?? opt?.orgSet ?? []) as Array<{ name: string; opts: string[] }>
      for (const s of sets) {
        if (s.name && s.opts?.length > 0) {
          const values = s.opts.slice(0, 8).join(' / ')
          const more = s.opts.length > 8 ? ` 외 ${s.opts.length - 8}종` : ''
          specs.push([s.name, values + more])
        }
      }
    } catch { /* 파싱 실패 무시 */ }
  }

  // 카테고리
  const category = d.category as Record<string, Record<string, string>> | undefined
  if (category?.current?.name) {
    specs.push(['카테고리', category.current.name])
  }

  return specs
}

/**
 * 스펙 테이블 HTML 생성
 */
function buildSpecTableHtml(specs: Array<[string, string]>): string {
  if (specs.length === 0) return ''

  const TD_LABEL = 'padding:8px 12px; background:#f8f9fa; border:1px solid #eee; font-weight:600; width:30%;'
  const TD_VALUE = 'padding:8px 12px; border:1px solid #eee;'
  return `
    <div style="padding:20px 0; border-top:1px solid #eee;">
      <h2 style="font-size:18px; font-weight:600; margin:0 0 12px;">제품 사양</h2>
      <table style="width:100%; border-collapse:collapse;">
        ${specs.map(([k, v]) => `<tr><td style="${TD_LABEL}">${k}</td><td style="${TD_VALUE}">${v}</td></tr>`).join('')}
      </table>
    </div>`
}

/**
 * 배송 정보 HTML 생성
 */
function buildShippingHtml(d: Record<string, unknown>): string {
  const deli = d.deli as Record<string, unknown> | undefined
  if (!deli) return ''

  const dome = deli.dome as Record<string, string> | undefined
  const feeExtra = deli.feeExtra as Record<string, string> | undefined
  const items: string[] = []
  items.push(`배송방법: ${deli.method ?? '택배'}`)
  items.push(`배송비: ${parseInt(dome?.fee ?? '2500', 10).toLocaleString()}원`)
  if (deli.wating) items.push(`배송기간: ${deli.wating}`)
  if (deli.fastDeli === 'true') items.push('빠른배송 가능')
  if (feeExtra?.jeju) items.push(`제주: +${parseInt(feeExtra.jeju, 10).toLocaleString()}원`)
  if (feeExtra?.islands) items.push(`도서산간: +${parseInt(feeExtra.islands, 10).toLocaleString()}원`)

  return `
    <div style="padding:20px 0; border-top:1px solid #eee;">
      <h2 style="font-size:18px; font-weight:600; margin:0 0 12px;">배송 안내</h2>
      <ul style="list-style:none; padding:0; margin:0;">
        ${items.map((item) => `<li style="padding:4px 0; font-size:14px;">${item}</li>`).join('')}
      </ul>
    </div>`
}

/**
 * 교환/반품 HTML 생성
 */
function buildReturnHtml(d: Record<string, unknown>): string {
  const ret = d.return as Record<string, unknown> | undefined
  if (!ret) return ''

  return `
    <div style="padding:20px 0; border-top:1px solid #eee;">
      <h2 style="font-size:18px; font-weight:600; margin:0 0 12px;">교환/반품 안내</h2>
      <ul style="list-style:none; padding:0; margin:0;">
        <li style="padding:4px 0; font-size:14px;">반품배송비: ${(Number(ret.deliAmt) || 2500).toLocaleString()}원</li>
        ${ret.deliAmtDouble === 'true' ? '<li style="padding:4px 0; font-size:14px;">교환배송비: 왕복 부담</li>' : ''}
        <li style="padding:4px 0; font-size:14px;">수거 후 환불 처리 (영업일 기준 3~5일)</li>
        <li style="padding:4px 0; font-size:14px; color:#999;">단순변심 반품은 수령 후 7일 이내 가능</li>
      </ul>
    </div>`
}

/**
 * 키워드 태그 HTML 생성
 */
function buildKeywordTagsHtml(d: Record<string, unknown>): string {
  const basis = d.basis as Record<string, unknown> | undefined
  const keywords = basis?.keywords as Record<string, string[]> | undefined
  const kwList = keywords?.kw ?? []
  if (kwList.length === 0) return ''

  return `
    <div style="padding:20px 0; border-top:1px solid #eee; text-align:center;">
      ${kwList.slice(0, 8).map((kw) => `<span style="display:inline-block; padding:4px 12px; margin:3px; background:#f0f0f0; border-radius:20px; font-size:12px; color:#666;">#${kw}</span>`).join('')}
    </div>`
}

/**
 * 리뷰 유도 섹션 (부스트 모드에서만)
 */
function buildReviewEncouragementHtml(boostMode: boolean): string {
  if (!boostMode) return ''

  return `
    <div style="padding:20px 0; border-top:1px solid #eee; text-align:center; background:#fff9c4; border-radius:8px; margin:10px 0;">
      <p style="font-size:16px; font-weight:600; color:#f57f17; margin:0 0 8px;">
        구매 후기를 남겨주세요!</p>
      <p style="font-size:14px; color:#666; margin:0;">
        포토 리뷰 작성 시 1,000원 적립금을 드립니다.</p>
    </div>`
}

/**
 * 상세 HTML 생성 (v2 — 차별화 엔진 통합)
 *
 * 구조:
 *   USP 배너 → 이미지 → 원본 상세 → 호환성표 → 구매가이드 →
 *   수량가이드 → 스펙 테이블 → FAQ → 안전경고 →
 *   배송/반품 → 리뷰유도 → 키워드 → 푸터
 */
export function buildDetailHtml(
  imageUrls: string[],
  originalDescription: string,
  productName?: string,
  salePrice?: number,
  domeggookData?: Record<string, unknown> | null,
  options?: DetailHtmlOptions,
): string {
  // 도매꾹 데이터 없으면 기본 fallback
  if (!domeggookData) {
    if (imageUrls.length === 0) return originalDescription
    const imageHtml = imageUrls
      .map((url) => `<img src="${url}" alt="상품 이미지" style="width:100%;max-width:860px;display:block;margin:0 auto 8px;" />`)
      .join('\n')
    return `${imageHtml}\n${originalDescription}`
  }

  const sections: string[] = []
  const name = productName ?? ''
  const boostMode = options?.boostMode ?? false
  const category = options?.category ?? name

  // ---- 1. USP 배너 (최상단) ----
  sections.push(generateUspBanner({ boostMode, category }))

  // ---- 2. 헤더: 상품명 + 가격 ----
  sections.push(`
    <div style="max-width:860px; margin:0 auto; font-family:'Noto Sans KR',sans-serif; color:#333;">
    <div style="text-align:center; padding:30px 0; border-bottom:2px solid #222;">
      <h1 style="font-size:24px; font-weight:700; margin:0 0 12px;">${name}</h1>
      ${salePrice ? `<p style="font-size:28px; color:#e74c3c; font-weight:700;">${salePrice.toLocaleString()}원</p>` : ''}
    </div>`)

  // ---- 3. 이미지 ----
  if (imageUrls.length > 0) {
    const imageHtml = imageUrls
      .map((url) => `<img src="${url}" alt="${name}" style="width:100%;max-width:860px;display:block;margin:0 auto 8px;" />`)
      .join('\n')
    sections.push(`<div style="padding:20px 0;">${imageHtml}</div>`)
  }

  // ---- 4. 도매꾹 원본 상세 HTML ----
  const desc = domeggookData.desc as Record<string, unknown> | undefined
  const contents = desc?.contents as Record<string, string> | undefined
  const origHtml = contents?.item ?? ''
  if (origHtml) {
    sections.push(`<div style="padding:20px 0;">${origHtml}</div>`)
  }

  // ---- 5. 스펙 추출 (여러 섹션에서 공유) ----
  const specs = extractAllSpecs(name, domeggookData)

  // ---- 6. 호환성 표 ----
  const compatHtml = generateCompatibilityTable({ specs, productName: name })
  if (compatHtml) sections.push(compatHtml)

  // ---- 7. 구매 가이드 ----
  const guideHtml = getBuyingGuideHtml(category)
  if (guideHtml) sections.push(guideHtml)

  // ---- 8. 수량 가이드 ----
  const qtyHtml = generateQuantityGuide(category)
  if (qtyHtml) sections.push(qtyHtml)

  // ---- 9. 스펙 테이블 ----
  sections.push(buildSpecTableHtml(specs))

  // ---- 10. FAQ ----
  sections.push(generateFaqHtml({ category, specs }))

  // ---- 11. 안전 경고 ----
  const safetyHtml = generateSafetyWarning(category)
  if (safetyHtml) sections.push(safetyHtml)

  // ---- 12. 배송 ----
  sections.push(buildShippingHtml(domeggookData))

  // ---- 13. 교환/반품 ----
  sections.push(buildReturnHtml(domeggookData))

  // ---- 14. 리뷰 유도 (부스트 모드) ----
  sections.push(buildReviewEncouragementHtml(boostMode))

  // ---- 15. 키워드 태그 ----
  sections.push(buildKeywordTagsHtml(domeggookData))

  // ---- 16. 푸터 ----
  sections.push(`
    <div style="padding:20px 0; border-top:1px solid #eee; text-align:center; color:#999; font-size:12px;">
      <p>본 상품은 품질 검수 후 발송됩니다.</p>
      <p>문의사항은 톡톡으로 편하게 연락주세요.</p>
    </div>
    </div>`)

  return sections.filter(Boolean).join('')
}
