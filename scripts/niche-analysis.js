// =============================================
// 니치 카테고리 발굴 분석
// - 도매꾹 카테고리별 상품 수/가격대 분석
// - 네이버 쇼핑 경쟁 밀도 추정 (Playwright)
// - 마진 가능성 + 경쟁 강도 매트릭스
// =============================================

const axios = require('axios')
const { chromium } = require('playwright')
require('dotenv').config()

const API_KEY = process.env.DOMEGGOOK_API_KEY
const API_URL = 'https://domeggook.com/ssl/api/'

// 세분화된 니치 키워드 (일반적 → 구체적)
const NICHE_KEYWORDS = [
  // === 공구/하드웨어 (세분화) ===
  { kw: '소켓렌치', group: '공구-핸드툴' },
  { kw: '토크렌치', group: '공구-핸드툴' },
  { kw: '육각렌치', group: '공구-핸드툴' },
  { kw: '스패너', group: '공구-핸드툴' },
  { kw: '드라이버비트', group: '공구-전동부속' },
  { kw: '드릴비트', group: '공구-전동부속' },
  { kw: '절단날', group: '공구-전동부속' },
  { kw: '연마디스크', group: '공구-전동부속' },
  { kw: '안전화', group: '안전-보호구' },
  { kw: '작업장갑', group: '안전-보호구' },
  { kw: '보안경', group: '안전-보호구' },
  { kw: '안전모', group: '안전-보호구' },
  { kw: '줄자', group: '공구-측정' },
  { kw: '수평기', group: '공구-측정' },
  { kw: '레이저측정기', group: '공구-측정' },
  { kw: '디지털캘리퍼스', group: '공구-측정' },
  { kw: '공구함', group: '공구-수납' },
  { kw: '공구가방', group: '공구-수납' },
  { kw: '부품함', group: '공구-수납' },

  // === 전자 악세서리 (세분화) ===
  { kw: 'C타입젠더', group: '전자-커넥터' },
  { kw: 'OTG젠더', group: '전자-커넥터' },
  { kw: 'HDMI젠더', group: '전자-커넥터' },
  { kw: 'USB연장케이블', group: '전자-케이블' },
  { kw: 'C타입케이블', group: '전자-케이블' },
  { kw: '마이크로5핀', group: '전자-케이블' },
  { kw: '차량용충전기', group: '전자-충전' },
  { kw: 'PD충전기', group: '전자-충전' },
  { kw: '무선충전패드', group: '전자-충전' },
  { kw: 'LED작업등', group: '전자-조명' },
  { kw: '헤드랜턴', group: '전자-조명' },
  { kw: '센서등', group: '전자-조명' },

  // === 캠핑/아웃도어 (세분화) ===
  { kw: '캠핑식기', group: '캠핑-취사' },
  { kw: '코펠세트', group: '캠핑-취사' },
  { kw: '캠핑버너', group: '캠핑-취사' },
  { kw: '바베큐그릴', group: '캠핑-화기' },
  { kw: '화로대', group: '캠핑-화기' },
  { kw: '캠핑의자', group: '캠핑-가구' },
  { kw: '캠핑테이블', group: '캠핑-가구' },
  { kw: '캠핑수납박스', group: '캠핑-수납' },
  { kw: '캠핑조명', group: '캠핑-조명' },

  // === 생활/수납 (세분화) ===
  { kw: '다용도정리함', group: '수납-정리' },
  { kw: '서랍정리함', group: '수납-정리' },
  { kw: '신발정리대', group: '수납-정리' },
  { kw: '옷걸이', group: '수납-정리' },
  { kw: '밀폐용기세트', group: '주방-수납' },
  { kw: '냉장고정리', group: '주방-수납' },
  { kw: '양념통세트', group: '주방-수납' },

  // === 자동차 (세분화) ===
  { kw: '차량용거치대', group: '자동차-악세서리' },
  { kw: '차량방향제', group: '자동차-악세서리' },
  { kw: '트렁크정리함', group: '자동차-수납' },
  { kw: '세차스폰지', group: '자동차-세차' },
  { kw: '세차타올', group: '자동차-세차' },

  // === 반려동물 ===
  { kw: '강아지장난감', group: '반려-장난감' },
  { kw: '고양이장난감', group: '반려-장난감' },
  { kw: '펫브러쉬', group: '반려-용품' },
  { kw: '강아지옷', group: '반려-의류' },
  { kw: '펫캐리어', group: '반려-이동' },

  // === 사무/문구 ===
  { kw: '데스크정리', group: '사무-정리' },
  { kw: '모니터받침대', group: '사무-가구' },
  { kw: '독서대', group: '사무-가구' },
  { kw: '화이트보드', group: '사무-사무용품' },
]

async function searchDomeggook(keyword, size = 30) {
  try {
    const params = new URLSearchParams({
      ver: '4.1', mode: 'getItemList', aid: API_KEY,
      market: 'dome', om: 'json', kw: keyword, sz: String(size),
    })
    const res = await axios.get(`${API_URL}?${params}`, { timeout: 10000 })
    return res.data?.domeggook?.list?.item || []
  } catch (err) {
    return []
  }
}

async function checkNaverCompetition(keyword, browser) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })
  const page = await ctx.newPage()

  try {
    const url = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword)}&sort=rel`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    // 총 결과 수 추출
    const totalText = await page.$eval(
      '[class*="subFilter_num"], [class*="totalCount"], [class*="result_num"]',
      (el) => el.textContent
    ).catch(() => null)

    let totalCount = 0
    if (totalText) {
      const match = totalText.replace(/,/g, '').match(/(\d+)/)
      totalCount = match ? parseInt(match[1], 10) : 0
    }

    // 상위 5개 가격 추출
    const prices = await page.$$eval(
      '[class*="price_num"] span, [class*="price"] em',
      (els) => els.slice(0, 10).map((el) => {
        const num = el.textContent?.replace(/[^0-9]/g, '')
        return num ? parseInt(num, 10) : 0
      }).filter((p) => p > 100)
    ).catch(() => [])

    // 광고 수 추출
    const adCount = await page.$$eval(
      '[class*="ad_"] , [class*="광고"]',
      (els) => els.length
    ).catch(() => 0)

    await page.close()
    await ctx.close()

    return { totalCount, prices: prices.slice(0, 5), adCount }
  } catch {
    await page.close().catch(() => {})
    await ctx.close().catch(() => {})
    return { totalCount: 0, prices: [], adCount: 0 }
  }
}

async function main() {
  if (!API_KEY) {
    console.error('DOMEGGOOK_API_KEY 필요')
    process.exit(1)
  }

  console.log('=== 니치 카테고리 발굴 분석 ===')
  console.log(`분석 키워드: ${NICHE_KEYWORDS.length}개\n`)

  // Phase 1: 도매꾹 공급 데이터 수집
  console.log('Phase 1: 도매꾹 공급 데이터 수집...')
  const results = []

  for (let i = 0; i < NICHE_KEYWORDS.length; i++) {
    const { kw, group } = NICHE_KEYWORDS[i]
    const items = await searchDomeggook(kw)

    if (items.length === 0) {
      results.push({ kw, group, supplyCount: 0, avgWholesale: 0, minWholesale: 0, maxWholesale: 0, medianWholesale: 0 })
    } else {
      const prices = items.map((it) => parseInt(it.price, 10)).filter((p) => p > 0).sort((a, b) => a - b)
      const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
      const median = prices[Math.floor(prices.length / 2)]
      results.push({
        kw, group,
        supplyCount: items.length,
        avgWholesale: avg,
        minWholesale: prices[0],
        maxWholesale: prices[prices.length - 1],
        medianWholesale: median,
      })
    }

    await new Promise((r) => setTimeout(r, 200))
    process.stdout.write(`\r  [${i + 1}/${NICHE_KEYWORDS.length}] ${kw}`)
  }

  console.log('\n\nPhase 2: 네이버 쇼핑 경쟁 밀도 분석...')

  let browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch {
    console.log('  Playwright 브라우저 실행 불가 — 경쟁 밀도 분석 스킵')
    browser = null
  }

  if (browser) {
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.supplyCount === 0) continue

      const comp = await checkNaverCompetition(r.kw, browser)
      r.naverTotalCount = comp.totalCount
      r.naverPrices = comp.prices
      r.naverAdCount = comp.adCount

      // 네이버 최저가 vs 도매가 마진 추정
      if (comp.prices.length > 0 && r.medianWholesale > 0) {
        const naverMedian = comp.prices.length > 2
          ? comp.prices[Math.floor(comp.prices.length / 2)]
          : comp.prices[0]
        r.naverMedianPrice = naverMedian
        r.estimatedMargin = Math.round(((naverMedian - r.medianWholesale * 1.1) / naverMedian) * 100) // 10% 비용 가산
      }

      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1000))
      process.stdout.write(`\r  [${i + 1}/${results.length}] ${r.kw} — 경쟁: ${comp.totalCount}건, 광고: ${comp.adCount}`)
    }
    await browser.close()
  }

  // =============================================
  // 분석 결과
  // =============================================
  console.log('\n\n' + '='.repeat(80))
  console.log('니치 카테고리 종합 분석')
  console.log('='.repeat(80))

  // 그룹별 집계
  const groups = {}
  for (const r of results) {
    if (!groups[r.group]) groups[r.group] = []
    groups[r.group].push(r)
  }

  // 스코어링: 경쟁 적음 + 마진 높음 + 공급 충분 = 최고 니치
  const scoredResults = results
    .filter((r) => r.supplyCount >= 3)
    .map((r) => {
      let score = 0

      // 공급 충분 (도매꾹 상품 수)
      if (r.supplyCount >= 20) score += 20
      else if (r.supplyCount >= 10) score += 15
      else if (r.supplyCount >= 5) score += 10
      else score += 5

      // 경쟁 적음 (네이버 검색 결과 수 — 적을수록 좋음)
      const nc = r.naverTotalCount || 0
      if (nc === 0) score += 15 // 데이터 없음 — 중립
      else if (nc < 500) score += 30
      else if (nc < 2000) score += 25
      else if (nc < 5000) score += 15
      else if (nc < 20000) score += 5
      else score += 0

      // 광고 적음 (적을수록 좋음)
      const ad = r.naverAdCount || 0
      if (ad <= 1) score += 15
      else if (ad <= 3) score += 10
      else if (ad <= 5) score += 5
      else score += 0

      // 마진 추정
      const margin = r.estimatedMargin || 0
      if (margin >= 50) score += 30
      else if (margin >= 40) score += 25
      else if (margin >= 30) score += 20
      else if (margin >= 20) score += 10
      else if (margin >= 10) score += 5
      else score += 0

      // 도매가 적정 (너무 싸면 객단가↓, 너무 비싸면 리스크↑)
      const med = r.medianWholesale
      if (med >= 3000 && med <= 30000) score += 10
      else if (med >= 1000 && med <= 50000) score += 5
      else score += 0

      return { ...r, score }
    })
    .sort((a, b) => b.score - a.score)

  // TOP 니치
  console.log('\n★ 니치 점수 TOP 20 (경쟁 적음 + 마진 높음 + 공급 충분)')
  console.log('-'.repeat(100))
  console.log('순위 | 키워드 | 그룹 | 점수 | 도매 상품수 | 도매 중위가 | 네이버 경쟁 | 광고 | 추정마진')
  console.log('-'.repeat(100))

  for (let i = 0; i < Math.min(scoredResults.length, 20); i++) {
    const r = scoredResults[i]
    console.log(
      `${String(i + 1).padStart(4)} | ${r.kw.padEnd(14)} | ${r.group.padEnd(14)} | ${String(r.score).padStart(4)} | ` +
      `${String(r.supplyCount).padStart(10)} | ${(r.medianWholesale || 0).toLocaleString().padStart(10)}원 | ` +
      `${(r.naverTotalCount || 0).toLocaleString().padStart(10)} | ${String(r.naverAdCount || 0).padStart(4)} | ` +
      `${r.estimatedMargin !== undefined ? r.estimatedMargin + '%' : 'N/A'}`
    )
  }

  // 그룹별 평균 점수
  console.log('\n\n★ 그룹별 평균 니치 점수')
  console.log('-'.repeat(60))
  const groupScores = []
  for (const [group, items] of Object.entries(groups)) {
    const scored = items.filter((r) => scoredResults.find((s) => s.kw === r.kw))
    if (scored.length === 0) continue
    const avgScore = Math.round(
      scored.reduce((s, r) => s + (scoredResults.find((sr) => sr.kw === r.kw)?.score || 0), 0) / scored.length
    )
    const avgMargin = Math.round(
      scored.reduce((s, r) => s + (r.estimatedMargin || 0), 0) / scored.length
    )
    groupScores.push({ group, avgScore, avgMargin, count: scored.length })
  }
  groupScores.sort((a, b) => b.avgScore - a.avgScore)

  for (const g of groupScores) {
    const bar = '█'.repeat(Math.round(g.avgScore / 3))
    console.log(`${g.group.padEnd(18)} | 점수 ${String(g.avgScore).padStart(3)} | 마진 ${String(g.avgMargin).padStart(3)}% | ${g.count}개 키워드 | ${bar}`)
  }

  // 최종 추천
  console.log('\n\n' + '='.repeat(80))
  console.log('최종 추천: 집중할 니치 카테고리')
  console.log('='.repeat(80))

  const topGroups = groupScores.slice(0, 5)
  for (let i = 0; i < topGroups.length; i++) {
    const g = topGroups[i]
    const keywords = scoredResults.filter((r) => r.group === g.group).slice(0, 5)
    console.log(`\n${i + 1}위: ${g.group} (평균 점수: ${g.avgScore}, 평균 마진: ${g.avgMargin}%)`)
    console.log(`  추천 키워드: ${keywords.map((k) => k.kw).join(', ')}`)
    console.log(`  공급: 도매꾹 ${keywords.reduce((s, k) => s + k.supplyCount, 0)}개 상품`)
    console.log(`  경쟁: 네이버 평균 ${Math.round(keywords.reduce((s, k) => s + (k.naverTotalCount || 0), 0) / keywords.length).toLocaleString()}건`)
  }

  // JSON 저장
  const fs = require('fs')
  fs.writeFileSync(
    'D:/projects/smartstore-automation/docs/niche-analysis.json',
    JSON.stringify({
      timestamp: new Date().toISOString(),
      totalKeywords: NICHE_KEYWORDS.length,
      topNiches: scoredResults.slice(0, 30),
      groupScores,
      allResults: results,
    }, null, 2),
    'utf8'
  )
  console.log('\n\n분석 결과 저장: docs/niche-analysis.json')
}

main().catch(console.error)
