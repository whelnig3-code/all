// =============================================
// 도매꾹 상품 데이터 기반 경쟁가 분석 스크립트
// - 1000개 샘플 수집 (도매꾹 API)
// - 원산지별 가격 패턴 분석
// - 키워드 추출 패턴 연구
// =============================================

const axios = require('axios')
require('dotenv').config()

const API_KEY = process.env.DOMEGGOOK_API_KEY
const API_URL = 'https://domeggook.com/ssl/api/'

// 도매꾹 주력 카테고리 기반 검색 키워드
const SEARCH_KEYWORDS = [
  // 공구/하드웨어
  '전동드릴', '그라인더', '렌치세트', '드릴비트', '멀티툴',
  '니퍼', '스패너', '토크렌치', '육각렌치', '수평기',
  '드라이버세트', '플라이어', '절단기', '줄자', '밴드쏘',
  // 전자/IT
  '충전기', 'USB허브', '보조배터리', '이어폰', '마우스',
  'LED등', '멀티탭', 'HDMI케이블', 'C타입', '블루투스',
  '어댑터', '젠더', '허브', '스피커', '키보드',
  // 생활/주방
  '텀블러', '도시락', '주방용품', '전기포트', '청소기',
  '가습기', '선풍기', '히터', '수납함', '정리함',
  '밀폐용기', '프라이팬', '냄비', '도마', '칼세트',
  // 캠핑/아웃도어
  '캠핑의자', '버너', '코펠', '침낭', '랜턴',
  '캠핑테이블', '타프', '아이스박스', '화로', '텐트',
  // 자동차
  '블랙박스', '차량충전기', '점프스타터', '세차용품', '방향제',
  // 안전/보호
  '안전화', '작업장갑', '안전모', '보안경', '방진마스크',
]

// 원산지 패턴
const ORIGIN_PATTERNS = [
  { label: '국산', regex: /국산|국내산|한국산|MADE\s*IN\s*KOREA|메이드인코리아/i },
  { label: '중국산', regex: /중국산|중국제|MADE\s*IN\s*CHINA|차이나/i },
  { label: '일본산', regex: /일본산|일제|MADE\s*IN\s*JAPAN/i },
  { label: '대만산', regex: /대만산|대만제|MADE\s*IN\s*TAIWAN/i },
  { label: '독일산', regex: /독일산|독일제|MADE\s*IN\s*GERMANY/i },
  { label: '미국산', regex: /미국산|미제|MADE\s*IN\s*USA/i },
]

// 브랜드 패턴
const BRAND_PATTERNS = [
  // 국산
  '계양', '아임삭', '대우', 'KTC', '한일', '쿠쿠', '위닉스', '오쿠', '락앤락',
  // 글로벌
  '보쉬', 'BOSCH', '마키타', 'MAKITA', '디월트', 'DEWALT', '밀워키', 'MILWAUKEE',
  '히타치', 'HITACHI', '스탠리', 'STANLEY',
  // 중국
  '샤오미', 'XIAOMI', '바스우스', 'BASEUS', '안커', 'ANKER', '유그린', 'UGREEN',
]

// 스펙 패턴
const SPEC_PATTERNS = [
  { label: '전압', regex: /(\d+(?:\.\d+)?)\s*[Vv](?:olt)?/i },
  { label: '출력', regex: /(\d+(?:\.\d+)?)\s*[Ww](?:att)?/i },
  { label: '용량', regex: /(\d+(?:,\d+)?)\s*(?:mAh|mah|ml|ML|L|리터)/i },
  { label: '사이즈mm', regex: /(\d+(?:\.\d+)?)\s*(?:mm)/i },
  { label: '사이즈cm', regex: /(\d+(?:\.\d+)?)\s*(?:cm)/i },
  { label: '무게', regex: /(\d+(?:\.\d+)?)\s*(?:kg|g)\b/i },
  { label: '구성', regex: /(\d+)\s*(?:종|개입|p(?:cs)?|세트)/i },
  { label: '재질', regex: /(스테인리스|스틸|알루미늄|합금|크롬바나듐|탄소강|티타늄|나일론|실리콘|ABS|PP|PE)/i },
]

async function searchDomeggook(keyword, page = 1, size = 50) {
  try {
    const params = new URLSearchParams({
      ver: '4.1', mode: 'getItemList', aid: API_KEY,
      market: 'dome', om: 'json', kw: keyword,
      sz: String(size), pg: String(page),
    })
    const res = await axios.get(`${API_URL}?${params}`, { timeout: 10000 })
    return res.data?.domeggook?.list?.item || []
  } catch (err) {
    console.error(`검색 실패 [${keyword}]:`, err.message)
    return []
  }
}

async function getItemDetail(itemNo) {
  try {
    const params = new URLSearchParams({
      ver: '4.5', mode: 'getItemView', aid: API_KEY,
      no: String(itemNo), om: 'json',
    })
    const res = await axios.get(`${API_URL}?${params}`, { timeout: 8000 })
    return res.data?.domeggook || null
  } catch {
    return null
  }
}

function detectOrigin(title, detail) {
  // 1. API detail에서 원산지 확인
  if (detail?.detail?.country) {
    const country = String(detail.detail.country).replace(/_/g, ' ').trim()
    if (/한국|korea|대한민국/i.test(country)) return '국산'
    if (/중국|china/i.test(country)) return '중국산'
    if (/일본|japan/i.test(country)) return '일본산'
    if (/대만|taiwan/i.test(country)) return '대만산'
    if (/독일|germany/i.test(country)) return '독일산'
    if (/미국|usa|u\.s/i.test(country)) return '미국산'
    if (country && country !== '해당없음' && country !== '.') return country
  }

  // 2. 상품명에서 패턴 매칭
  for (const { label, regex } of ORIGIN_PATTERNS) {
    if (regex.test(title)) return label
  }

  // 3. 브랜드 기반 추정
  const lower = title.toLowerCase()
  if (['보쉬', 'bosch', '디월트', 'dewalt', '스탠리', 'stanley'].some(b => lower.includes(b))) return '독일/미국(추정)'
  if (['마키타', 'makita', '히타치', 'hitachi'].some(b => lower.includes(b))) return '일본(추정)'
  if (['샤오미', 'xiaomi', '바스우스', 'baseus'].some(b => lower.includes(b))) return '중국(추정)'
  if (['계양', '아임삭', '대우', '한일', '쿠쿠', '위닉스'].some(b => lower.includes(b))) return '국산(추정)'

  return '미확인'
}

function extractSpecs(title) {
  const specs = {}
  for (const { label, regex } of SPEC_PATTERNS) {
    const match = title.match(regex)
    if (match) specs[label] = match[1]
  }
  return specs
}

function extractKeywords(title) {
  const clean = title.replace(/<[^>]+>/g, '').trim()
  let brand = ''
  for (const b of BRAND_PATTERNS) {
    if (clean.toLowerCase().includes(b.toLowerCase())) {
      brand = b
      break
    }
  }
  const modelMatch = clean.match(/[A-Z]{1,5}[\-]?\d{2,6}[A-Z]?/i)
  const model = modelMatch ? modelMatch[0] : ''
  return { brand, model, specs: extractSpecs(clean) }
}

async function main() {
  if (!API_KEY) {
    console.error('DOMEGGOOK_API_KEY가 설정되지 않았습니다.')
    process.exit(1)
  }

  console.log('=== 도매꾹 상품 데이터 경쟁가 분석 ===')
  console.log(`검색 키워드: ${SEARCH_KEYWORDS.length}개`)
  console.log(`목표 샘플: ~1000개\n`)

  const allProducts = []
  const seen = new Set() // 중복 방지
  const perKeyword = Math.ceil(1200 / SEARCH_KEYWORDS.length) // ~20개

  // Phase 1: 목록 수집
  for (let i = 0; i < SEARCH_KEYWORDS.length; i++) {
    const kw = SEARCH_KEYWORDS[i]
    const items = await searchDomeggook(kw, 1, Math.min(perKeyword + 5, 50))

    for (const item of items) {
      if (seen.has(item.no)) continue
      seen.add(item.no)

      allProducts.push({
        no: item.no,
        keyword: kw,
        title: item.title,
        price: parseInt(item.price, 10),
        retailPrice: parseInt(item.retailPrice || item.price, 10),
        maker: item.maker || '',
        brand: item.brand || '',
        detail: null, // Phase 2에서 채움
        origin: '미확인',
        specs: extractSpecs(item.title),
        keyInfo: extractKeywords(item.title),
      })
    }

    // API 속도 제한
    await new Promise(r => setTimeout(r, 200))
    process.stdout.write(`\r[${i + 1}/${SEARCH_KEYWORDS.length}] ${kw.padEnd(10)} → ${items.length}개 (누적: ${allProducts.length})`)
  }

  console.log(`\n\n목록 수집 완료: ${allProducts.length}개`)

  // Phase 2: 상세 데이터 조회 (원산지 확인용, 상위 300개만)
  console.log('\n상세 데이터 조회 중 (원산지 확인)...')
  const detailSample = allProducts.slice(0, 300) // API 부하 고려
  let detailCount = 0

  for (let i = 0; i < detailSample.length; i++) {
    const p = detailSample[i]
    const detail = await getItemDetail(p.no)
    if (detail) {
      p.detail = detail
      p.origin = detectOrigin(p.title, detail)
      detailCount++

      // 상세 데이터에서 추가 정보 추출
      if (detail.detail) {
        if (detail.detail.manufacturer && detail.detail.manufacturer !== '해당없음') {
          p.maker = String(detail.detail.manufacturer)
        }
        if (detail.detail.size && detail.detail.size !== '.' && detail.detail.size !== '1') {
          p.specs['사이즈(API)'] = String(detail.detail.size)
        }
        if (detail.detail.weight && detail.detail.weight !== '.' && detail.detail.weight !== '1') {
          p.specs['무게(API)'] = String(detail.detail.weight)
        }
      }
    }
    await new Promise(r => setTimeout(r, 150))
    if (i % 20 === 19) process.stdout.write(`\r상세 조회: ${i + 1}/${detailSample.length} (성공: ${detailCount})`)
  }

  // 상세 없는 상품은 타이틀 기반 원산지 추정
  for (const p of allProducts) {
    if (p.origin === '미확인') {
      p.origin = detectOrigin(p.title, null)
    }
  }

  console.log(`\n상세 조회 완료: ${detailCount}/${detailSample.length}개 성공\n`)

  // =============================================
  // 분석 시작
  // =============================================

  // 분석 1: 원산지별 가격 분포
  console.log('='.repeat(60))
  console.log('분석 1: 원산지별 가격 분포')
  console.log('='.repeat(60))

  const byOrigin = {}
  for (const p of allProducts) {
    if (!byOrigin[p.origin]) byOrigin[p.origin] = []
    byOrigin[p.origin].push(p)
  }

  const originStats = []
  for (const [origin, products] of Object.entries(byOrigin)) {
    const prices = products.map(p => p.price).sort((a, b) => a - b)
    const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
    const median = prices[Math.floor(prices.length / 2)]
    originStats.push({ origin, count: prices.length, avg, median, min: prices[0], max: prices[prices.length - 1] })
  }
  originStats.sort((a, b) => b.count - a.count)

  console.log('\n원산지 | 개수 | 평균 도매가 | 중위 도매가 | 최저 | 최고')
  console.log('-'.repeat(80))
  for (const s of originStats) {
    console.log(`${s.origin.padEnd(14)} | ${String(s.count).padStart(4)} | ${s.avg.toLocaleString().padStart(10)}원 | ${s.median.toLocaleString().padStart(10)}원 | ${s.min.toLocaleString().padStart(8)}원 | ${s.max.toLocaleString().padStart(10)}원`)
  }

  // 분석 2: 동일 키워드 내 원산지별 가격 비교
  console.log('\n' + '='.repeat(60))
  console.log('분석 2: 동일 키워드 내 원산지별 가격 비교')
  console.log('='.repeat(60))

  const kwComparisons = []
  for (const kw of SEARCH_KEYWORDS) {
    const kwProducts = allProducts.filter(p => p.keyword === kw)
    const korean = kwProducts.filter(p => p.origin.includes('국산'))
    const chinese = kwProducts.filter(p => p.origin.includes('중국'))

    if (korean.length >= 1 && chinese.length >= 1) {
      const korAvg = Math.round(korean.reduce((s, p) => s + p.price, 0) / korean.length)
      const chnAvg = Math.round(chinese.reduce((s, p) => s + p.price, 0) / chinese.length)
      const ratio = chnAvg > 0 ? (korAvg / chnAvg).toFixed(2) : 'N/A'
      kwComparisons.push({
        kw, korCount: korean.length, chnCount: chinese.length,
        korAvg, chnAvg, ratio: parseFloat(ratio) || 0,
        korSample: korean[0]?.title?.substring(0, 40),
        chnSample: chinese[0]?.title?.substring(0, 40),
      })
    }
  }

  if (kwComparisons.length > 0) {
    kwComparisons.sort((a, b) => b.ratio - a.ratio)
    console.log('\n키워드 | 국산(개/평균) | 중국산(개/평균) | 가격비')
    console.log('-'.repeat(80))
    for (const c of kwComparisons) {
      console.log(`${c.kw.padEnd(12)} | ${String(c.korCount).padStart(3)}개 ${c.korAvg.toLocaleString().padStart(9)}원 | ${String(c.chnCount).padStart(3)}개 ${c.chnAvg.toLocaleString().padStart(9)}원 | ${c.ratio}배`)
    }

    const avgRatio = kwComparisons.length > 0
      ? (kwComparisons.reduce((s, c) => s + c.ratio, 0) / kwComparisons.length).toFixed(2)
      : 'N/A'
    console.log(`\n★ 평균 가격비 (국산/중국산): ${avgRatio}배`)
  }

  // 분석 3: 동일 키워드 내 가격 편차 분석
  console.log('\n' + '='.repeat(60))
  console.log('분석 3: 동일 키워드 내 가격 편차 (왜 단순 키워드 비교가 위험한가)')
  console.log('='.repeat(60))

  const priceVariance = []
  for (const kw of SEARCH_KEYWORDS) {
    const kwPrices = allProducts.filter(p => p.keyword === kw).map(p => p.price)
    if (kwPrices.length < 3) continue
    kwPrices.sort((a, b) => a - b)
    const min = kwPrices[0]
    const max = kwPrices[kwPrices.length - 1]
    const median = kwPrices[Math.floor(kwPrices.length / 2)]
    const spread = max / min
    priceVariance.push({ kw, count: kwPrices.length, min, max, median, spread })
  }
  priceVariance.sort((a, b) => b.spread - a.spread)

  console.log('\n가격 편차 TOP 15:')
  console.log('키워드 | 개수 | 최저가 | 최고가 | 중위가 | 편차(배)')
  console.log('-'.repeat(80))
  for (const v of priceVariance.slice(0, 15)) {
    console.log(`${v.kw.padEnd(12)} | ${String(v.count).padStart(4)} | ${v.min.toLocaleString().padStart(9)}원 | ${v.max.toLocaleString().padStart(10)}원 | ${v.median.toLocaleString().padStart(9)}원 | ${v.spread.toFixed(1)}배`)
  }

  // 분석 4: 가격 편차가 큰 키워드의 최저/최고 상품 비교
  console.log('\n' + '='.repeat(60))
  console.log('분석 4: 최저가 vs 최고가 상품 비교 (다른 제품이 잡히는 케이스)')
  console.log('='.repeat(60))

  for (const v of priceVariance.slice(0, 8)) {
    const kwProducts = allProducts.filter(p => p.keyword === v.kw).sort((a, b) => a.price - b.price)
    const cheapest = kwProducts[0]
    const expensive = kwProducts[kwProducts.length - 1]

    console.log(`\n[${v.kw}] 가격차 ${v.spread.toFixed(1)}배`)
    console.log(`  최저: ${cheapest.price.toLocaleString()}원 — ${cheapest.title.substring(0, 55)}`)
    console.log(`       원산지: ${cheapest.origin} | 제조사: ${cheapest.maker || '-'}`)
    console.log(`  최고: ${expensive.price.toLocaleString()}원 — ${expensive.title.substring(0, 55)}`)
    console.log(`       원산지: ${expensive.origin} | 제조사: ${expensive.maker || '-'}`)
  }

  // 분석 5: 키워드 추출 성공률
  console.log('\n' + '='.repeat(60))
  console.log('분석 5: 상품명 키워드 추출 패턴')
  console.log('='.repeat(60))

  let withBrand = 0, withModel = 0, withSpecs = 0
  const specCounts = {}

  for (const p of allProducts) {
    if (p.keyInfo.brand) withBrand++
    if (p.keyInfo.model) withModel++
    if (Object.keys(p.specs).length > 0) {
      withSpecs++
      for (const k of Object.keys(p.specs)) {
        specCounts[k] = (specCounts[k] || 0) + 1
      }
    }
  }

  const total = allProducts.length
  console.log(`\n상품명에서 추출 가능한 정보 (총 ${total}개):`)
  console.log(`  브랜드 인식: ${withBrand}개 (${((withBrand / total) * 100).toFixed(1)}%)`)
  console.log(`  모델명 추출: ${withModel}개 (${((withModel / total) * 100).toFixed(1)}%)`)
  console.log(`  스펙 포함:   ${withSpecs}개 (${((withSpecs / total) * 100).toFixed(1)}%)`)

  console.log(`\n스펙별 출현 빈도:`)
  const sortedSpecs = Object.entries(specCounts).sort((a, b) => b[1] - a[1])
  for (const [spec, count] of sortedSpecs) {
    console.log(`  ${spec.padEnd(12)}: ${String(count).padStart(4)}회 (${((count / total) * 100).toFixed(1)}%)`)
  }

  // 분석 6: 원산지별 API 데이터 품질
  console.log('\n' + '='.repeat(60))
  console.log('분석 6: 원산지 식별 경로 (API vs 상품명)')
  console.log('='.repeat(60))

  let apiOrigin = 0, titleOrigin = 0, brandOrigin = 0, unknown = 0
  for (const p of detailSample) {
    if (p.detail?.detail?.country && !/해당없음|\./.test(String(p.detail.detail.country))) {
      apiOrigin++
    } else if (ORIGIN_PATTERNS.some(({ regex }) => regex.test(p.title))) {
      titleOrigin++
    } else if (p.origin.includes('추정')) {
      brandOrigin++
    } else {
      unknown++
    }
  }

  console.log(`\n상세 조회 샘플 ${detailSample.length}개 기준:`)
  console.log(`  API country 필드: ${apiOrigin}개 (${((apiOrigin / detailSample.length) * 100).toFixed(1)}%)`)
  console.log(`  상품명 패턴:      ${titleOrigin}개 (${((titleOrigin / detailSample.length) * 100).toFixed(1)}%)`)
  console.log(`  브랜드 추정:      ${brandOrigin}개 (${((brandOrigin / detailSample.length) * 100).toFixed(1)}%)`)
  console.log(`  미확인:           ${unknown}개 (${((unknown / detailSample.length) * 100).toFixed(1)}%)`)

  // 분석 7: 카테고리별 원산지 분포
  console.log('\n' + '='.repeat(60))
  console.log('분석 7: 키워드 그룹별 원산지 분포')
  console.log('='.repeat(60))

  const groups = {
    '공구/하드웨어': SEARCH_KEYWORDS.slice(0, 15),
    '전자/IT': SEARCH_KEYWORDS.slice(15, 30),
    '생활/주방': SEARCH_KEYWORDS.slice(30, 45),
    '캠핑/아웃도어': SEARCH_KEYWORDS.slice(45, 55),
    '자동차/안전': SEARCH_KEYWORDS.slice(55),
  }

  for (const [groupName, keywords] of Object.entries(groups)) {
    const groupProducts = allProducts.filter(p => keywords.includes(p.keyword))
    if (groupProducts.length === 0) continue

    const originDist = {}
    for (const p of groupProducts) {
      const key = p.origin.replace('(추정)', '').trim()
      originDist[key] = (originDist[key] || 0) + 1
    }

    console.log(`\n[${groupName}] (${groupProducts.length}개)`)
    const sorted = Object.entries(originDist).sort((a, b) => b[1] - a[1])
    for (const [origin, count] of sorted) {
      const pct = ((count / groupProducts.length) * 100).toFixed(1)
      const bar = '█'.repeat(Math.round(parseFloat(pct) / 5))
      console.log(`  ${origin.padEnd(12)}: ${String(count).padStart(4)}개 (${pct.padStart(5)}%) ${bar}`)
    }
  }

  // 결론
  console.log('\n' + '='.repeat(60))
  console.log('결론 & 경쟁가 비교 개선 제안')
  console.log('='.repeat(60))

  const avgSpread = priceVariance.length > 0
    ? (priceVariance.reduce((s, v) => s + v.spread, 0) / priceVariance.length).toFixed(1)
    : 'N/A'
  const highSpread = priceVariance.filter(v => v.spread >= 5).length

  console.log(`
[데이터 요약]
- 총 분석 샘플: ${allProducts.length}개 (${SEARCH_KEYWORDS.length}개 키워드)
- 상세 조회: ${detailCount}/${detailSample.length}개 성공
- 원산지 식별률: ${((allProducts.filter(p => p.origin !== '미확인').length / total) * 100).toFixed(1)}%
- 평균 가격 편차: ${avgSpread}배
- 5배 이상 편차 키워드: ${highSpread}/${priceVariance.length}개

[핵심 인사이트]
1. 같은 키워드로 검색해도 가격이 ${avgSpread}배 차이 → 다른 제품이 경쟁가로 잡힘
2. 원산지가 다르면 가격 자체가 다른 시장 → 국산끼리, 중국산끼리 비교해야 의미있음
3. 브랜드/모델명 포함 상품은 정밀 비교 가능, 없으면 카테고리+스펙 조합 필요

[경쟁가 비교 개선 제안]
1. 키워드 정밀화: "브랜드 + 핵심키워드 + 주요스펙" 조합으로 검색
   예: "전동드릴" → "보쉬 전동드릴 18V" 또는 "충전드릴 20V 리튬"
2. 원산지 필터: 같은 원산지 상품끼리만 비교
3. 가격 범위 필터: 중위가의 50~200% 범위만 유효 경쟁가
4. 이상치 제거: 최저/최고 10% 제거 후 비교 (trimmed mean)
`)

  // JSON 저장
  const fs = require('fs')
  const report = {
    timestamp: new Date().toISOString(),
    totalSamples: allProducts.length,
    detailSamples: detailCount,
    originStats,
    kwComparisons: kwComparisons.slice(0, 30),
    priceVariance: priceVariance.slice(0, 30),
    specCounts,
    extractionRates: {
      brand: `${((withBrand / total) * 100).toFixed(1)}%`,
      model: `${((withModel / total) * 100).toFixed(1)}%`,
      specs: `${((withSpecs / total) * 100).toFixed(1)}%`,
    },
    originDetection: {
      api: `${((apiOrigin / detailSample.length) * 100).toFixed(1)}%`,
      title: `${((titleOrigin / detailSample.length) * 100).toFixed(1)}%`,
      brand: `${((brandOrigin / detailSample.length) * 100).toFixed(1)}%`,
      unknown: `${((unknown / detailSample.length) * 100).toFixed(1)}%`,
    },
    sampleProducts: allProducts.slice(0, 50).map(p => ({
      title: p.title, price: p.price, origin: p.origin,
      maker: p.maker, specs: p.specs, keyword: p.keyword,
    })),
  }
  fs.writeFileSync(
    'D:/projects/smartstore-automation/docs/competitor-pricing-analysis.json',
    JSON.stringify(report, null, 2),
    'utf8'
  )
  console.log('분석 결과 저장: docs/competitor-pricing-analysis.json')
}

main().catch(console.error)
