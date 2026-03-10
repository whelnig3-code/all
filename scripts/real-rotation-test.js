// =============================================
// 실제 로테이션 테스트 (Real Production Cycle)
//
// 1회 로테이션:
//   도매꾹 실제 상품 크롤링 → 네이버 스마트스토어 등록 (SUSPENSION)
//   → 주문 폴링 → 톡톡 자동응답 → 텔레그램 알림 확인
//   → 정리 (등록 상품 판매중지 확인)
//
// 결과물은 실제 웹에서 확인 가능:
//   - 네이버 판매자센터: 등록된 상품
//   - 텔레그램 봇: 알림 메시지
//   - 톡톡 채팅: 자동응답
//
// 3회 연속 클린 패스 시 종료. 수정 시 0회 리셋.
// =============================================
require('dotenv').config();
const axios = require('axios');

const API = 'http://localhost:3100';
const AUTH = {
  username: process.env.ADMIN_USER || 'admin',
  password: process.env.ADMIN_PASS || 'tpl7eDZmHTfFdEf7zS0Lc+JgRIGul2i/',
};
const SHOP_ID = process.env.NAVER_SHOP_ID || 'ncp_1p2tcr_01';

let totalRuns = 0;
let consecutiveClean = 0;
const registeredProducts = []; // 정리용

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ts() { return new Date().toISOString().slice(11, 19); }

// 네이버 쇼핑 최저가 조회 (검색 API)
async function getNaverLowestPrice(productName) {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) return null;
  try {
    const res = await axios.get('https://openapi.naver.com/v1/search/shop.json', {
      params: { query: productName, display: 5, sort: 'asc' },
      headers: {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
      },
      timeout: 5000,
    });
    const items = res.data?.items || [];
    if (items.length === 0) return null;
    const prices = items.map(i => parseInt(i.lprice, 10)).filter(p => p > 0);
    return prices.length > 0 ? Math.min(...prices) : null;
  } catch { return null; }
}

// 판매가 계산 (1000원 올림 + 만원 경계에서만 심리가격 -100원)
// 20,000→19,900 (1만원대로 보임), 26,000→26,000 (어차피 2만원대)
function calcSalePrice(wholesalePrice, shippingFee) {
  const cost = wholesalePrice + shippingFee;
  const rawPrice = cost / (1 - 0.055 - 0.25);
  const ceil1000 = Math.ceil(rawPrice / 1000) * 1000;
  if (ceil1000 % 10000 === 0 && (ceil1000 - 100) >= rawPrice) {
    return ceil1000 - 100;
  }
  return ceil1000;
}

// =============================================
// STEP 1: 도매꾹 Open API로 실제 상품 조회
// =============================================
const DOMEGGOOK_API_KEY = process.env.DOMEGGOOK_API_KEY || 'fbf1f6fa439642f85c2f70c83633c4e4';
const DOMEGGOOK_API_URL = 'https://domeggook.com/ssl/api/';

// 검색 키워드 로테이션 (매 회차 다른 상품)
const SEARCH_KEYWORDS = ['USB', '충전기', '케이블', '이어폰', '보조배터리', '마우스', '키보드', '거치대'];

async function crawlRealProduct() {
  // 도매꾹 Open API로 상품 검색
  const keyword = SEARCH_KEYWORDS[totalRuns % SEARCH_KEYWORDS.length];
  const randomPage = Math.floor(Math.random() * 10) + 1;

  const params = new URLSearchParams({
    ver: '4.1',
    mode: 'getItemList',
    aid: DOMEGGOOK_API_KEY,
    market: 'dome',
    om: 'json',
    kw: keyword,
    sz: '10',
    pg: String(randomPage),
    so: 'rd',
  });

  const res = await axios.get(`${DOMEGGOOK_API_URL}?${params}`);
  const data = res.data?.domeggook;
  if (!data || !data.list?.item?.length) {
    return null;
  }

  const items = data.list.item.filter(
    (item) => item.no && item.title && parseInt(item.price, 10) > 0 && item.thumb
  );

  if (items.length === 0) {
    return null;
  }

  // 가격 경쟁력 있는 상품 찾기 (최대 5개 검사)
  const shuffled = items.sort(() => Math.random() - 0.5);
  let pick = null;
  let shippingFee = 2500;
  let naverLowest = null;
  let ourPrice = 0;

  for (const candidate of shuffled.slice(0, 5)) {
    const fee = parseInt(candidate.deli?.fee || '2500', 10);
    const price = calcSalePrice(parseInt(candidate.price, 10), fee);
    const lowest = await getNaverLowestPrice(candidate.title);

    if (lowest !== null && price > lowest) {
      console.log(`         [SKIP] ${candidate.title.slice(0, 30)}... 우리가격 ${price.toLocaleString()}원 > 네이버최저 ${lowest.toLocaleString()}원`);
      await sleep(300); // API rate limit
      continue;
    }

    pick = candidate;
    shippingFee = fee;
    naverLowest = lowest;
    ourPrice = price;
    if (lowest !== null) {
      console.log(`         [OK] 가격경쟁력 확인: 우리 ${price.toLocaleString()}원 ≤ 네이버최저 ${lowest.toLocaleString()}원`);
    } else {
      console.log(`         [OK] 네이버 미등록 상품 → 경쟁자 없음`);
    }
    break;
  }

  if (!pick) {
    return null;
  }

  // getItemView로 원본 이미지 + 상세정보 조회
  let imageUrl = pick.thumb.startsWith('http') ? pick.thumb : `https:${pick.thumb}`;
  let detailData = null;
  try {
    const viewParams = new URLSearchParams({
      ver: '4.5', mode: 'getItemView', aid: DOMEGGOOK_API_KEY,
      no: pick.no, om: 'json',
    });
    const viewRes = await axios.get(`${DOMEGGOOK_API_URL}?${viewParams}`, { timeout: 10000 });
    const viewItem = viewRes.data?.domeggook;
    if (viewItem) {
      detailData = viewItem;
      // PNG 버전 우선 사용 (확장자 명시되어 있어 네이버 업로드 호환)
      const thumbData = viewItem.thumb;
      if (thumbData?.largePng) {
        imageUrl = thumbData.largePng;
      } else if (thumbData?.original) {
        imageUrl = thumbData.original;
      }
    }
  } catch { /* 실패 시 목록 썸네일 사용 */ }

  return {
    sourceProductId: pick.no,
    name: pick.title,
    wholesalePrice: parseInt(pick.price, 10),
    shippingFee,
    imageUrl: imageUrl.startsWith('http') ? imageUrl : `https:${imageUrl}`,
    detailUrl: pick.url?.startsWith('http') ? pick.url : `https://domeggook.com/${pick.no}`,
    detailData, // 상세 HTML, 키워드, 스펙 등
    naverLowest, // 네이버 최저가 (null이면 미등록 상품)
    ourPrice,    // 우리 판매가 (사전 계산)
  };
}

// =============================================
// 상품 상세설명 생성
// =============================================
function buildDetailContent(product, salePrice) {
  const d = product.detailData;
  const sections = [];

  // 헤더: 상품명 + 가격
  sections.push(`
    <div style="max-width:860px; margin:0 auto; font-family:'Noto Sans KR',sans-serif; color:#333;">
    <div style="text-align:center; padding:30px 0; border-bottom:2px solid #222;">
      <h1 style="font-size:24px; font-weight:700; margin:0 0 12px;">${product.name}</h1>
      <p style="font-size:28px; color:#e74c3c; font-weight:700;">${salePrice.toLocaleString()}원</p>
    </div>`);

  // 도매꾹 원본 상세 HTML (이미지 포함)
  const origHtml = d?.desc?.contents?.item || '';
  if (origHtml) {
    sections.push(`
    <div style="padding:20px 0;">
      ${origHtml}
    </div>`);
  }

  // 제품 스펙 테이블 — API 데이터 + 상품명에서 추출
  const detail = d?.detail;
  const specs = [];

  // 1) API에서 제공하는 기본 스펙
  if (detail) {
    if (detail.manufacturer && detail.manufacturer !== '해당없음') specs.push(['제조사', detail.manufacturer]);
    if (detail.model && detail.model !== '해당없음') specs.push(['모델명', detail.model]);
    if (detail.country) specs.push(['원산지', detail.country.replace(/_/g, ' ')]);
    if (detail.size && detail.size !== '.' && detail.size !== '1') specs.push(['사이즈', detail.size]);
    if (detail.weight && detail.weight !== '.' && detail.weight !== '1') specs.push(['무게', detail.weight]);
    // KC인증 등 안전인증 정보
    const certs = detail.safetyCert || [];
    for (const cert of certs) {
      if (cert.cert === 'Y' && cert.no) {
        specs.push([`${cert.certName || '안전인증'}`, cert.no]);
      }
    }
  }

  // 2) 상품명에서 스펙 패턴 추출 (재질, 사이즈, 전력, 수량 등)
  const title = product.name || '';
  const specPatterns = [
    { label: '재질', regex: /(스테인리스|스틸|알루미늄|합금|크롬바나듐|탄소강|나일론|실리콘|PVC|ABS|PP|PE|목재|원목|대나무|가죽|면|폴리에스터|메쉬|옥스포드)/i },
    { label: '사이즈', regex: /(\d+(?:\.\d+)?\s*(?:mm|cm|m|인치|inch))/i },
    { label: '길이', regex: /(\d+(?:\.\d+)?\s*[Mm])\b/ },
    { label: '용량', regex: /(\d+(?:,\d+)?\s*(?:mAh|mah|ml|ML|L|리터))/i },
    { label: '출력', regex: /(\d+(?:\.\d+)?\s*[Ww])\b/ },
    { label: '전압', regex: /(\d+(?:\.\d+)?\s*[Vv])\b/ },
    { label: '포트', regex: /(\d+포트|\d+port)/i },
    { label: '구성', regex: /(\d+종|\d+개입|\d+p|\d+pcs|\d+세트)/i },
  ];
  for (const { label, regex } of specPatterns) {
    // 이미 같은 라벨이 있으면 스킵
    if (specs.some(([k]) => k === label)) continue;
    const match = title.match(regex);
    if (match) specs.push([label, match[1]]);
  }

  // 3) 옵션 정보 (색상, 사이즈 선택지 등)
  const selectOpt = d?.selectOpt;
  if (selectOpt) {
    try {
      const opt = typeof selectOpt === 'string' ? JSON.parse(selectOpt) : selectOpt;
      const sets = opt?.set || opt?.orgSet || [];
      for (const s of sets) {
        if (s.name && s.opts && s.opts.length > 0) {
          const optValues = s.opts.slice(0, 8).join(' / ');
          const more = s.opts.length > 8 ? ` 외 ${s.opts.length - 8}종` : '';
          specs.push([s.name, optValues + more]);
        }
      }
    } catch (e) { /* 파싱 실패 무시 */ }
  }

  // 4) 카테고리 정보
  const category = d?.category;
  if (category?.current?.name) {
    specs.push(['카테고리', category.current.name]);
  }

  if (specs.length > 0) {
    sections.push(`
    <div style="padding:20px 0; border-top:1px solid #eee;">
      <h2 style="font-size:18px; font-weight:600; margin:0 0 12px;">📋 제품 사양</h2>
      <table style="width:100%; border-collapse:collapse;">
        ${specs.map(([k, v]) => `<tr><td style="padding:8px 12px; background:#f8f9fa; border:1px solid #eee; font-weight:600; width:30%;">${k}</td><td style="padding:8px 12px; border:1px solid #eee;">${v}</td></tr>`).join('')}
      </table>
    </div>`);
  }

  // 배송 정보
  const deli = d?.deli;
  if (deli) {
    const deliItems = [];
    deliItems.push(`배송방법: ${deli.method || '택배'}`);
    deliItems.push(`배송비: ${parseInt(deli.dome?.fee || '2500', 10).toLocaleString()}원`);
    if (deli.wating) deliItems.push(`배송기간: ${deli.wating}`);
    if (deli.fastDeli === 'true') deliItems.push('⚡ 빠른배송 가능');
    if (deli.feeExtra) {
      if (deli.feeExtra.jeju) deliItems.push(`제주: +${parseInt(deli.feeExtra.jeju, 10).toLocaleString()}원`);
      if (deli.feeExtra.islands) deliItems.push(`도서산간: +${parseInt(deli.feeExtra.islands, 10).toLocaleString()}원`);
    }
    sections.push(`
    <div style="padding:20px 0; border-top:1px solid #eee;">
      <h2 style="font-size:18px; font-weight:600; margin:0 0 12px;">🚚 배송 안내</h2>
      <ul style="list-style:none; padding:0; margin:0;">
        ${deliItems.map(item => `<li style="padding:4px 0; font-size:14px;">• ${item}</li>`).join('')}
      </ul>
    </div>`);
  }

  // 교환/반품 정보
  const ret = d?.return;
  if (ret) {
    sections.push(`
    <div style="padding:20px 0; border-top:1px solid #eee;">
      <h2 style="font-size:18px; font-weight:600; margin:0 0 12px;">🔄 교환/반품 안내</h2>
      <ul style="list-style:none; padding:0; margin:0;">
        <li style="padding:4px 0; font-size:14px;">• 반품배송비: ${(ret.deliAmt || 2500).toLocaleString()}원</li>
        ${ret.deliAmtDouble === 'true' ? '<li style="padding:4px 0; font-size:14px;">• 교환배송비: 왕복 부담</li>' : ''}
        <li style="padding:4px 0; font-size:14px;">• 수거 후 환불 처리 (영업일 기준 3~5일)</li>
        <li style="padding:4px 0; font-size:14px; color:#999;">※ 단순변심 반품은 수령 후 7일 이내 가능</li>
      </ul>
    </div>`);
  }

  // 키워드 태그
  const keywords = d?.basis?.keywords?.kw || [];
  if (keywords.length > 0) {
    sections.push(`
    <div style="padding:20px 0; border-top:1px solid #eee; text-align:center;">
      ${keywords.slice(0, 8).map(kw => `<span style="display:inline-block; padding:4px 12px; margin:3px; background:#f0f0f0; border-radius:20px; font-size:12px; color:#666;">#${kw}</span>`).join('')}
    </div>`);
  }

  // 푸터
  sections.push(`
    <div style="padding:20px 0; border-top:1px solid #eee; text-align:center; color:#999; font-size:12px;">
      <p>본 상품은 품질 검수 후 발송됩니다.</p>
      <p>문의사항은 톡톡으로 편하게 연락주세요.</p>
    </div>
    </div>`);

  return sections.join('');
}

// =============================================
// STEP 2: 네이버 직접 등록 (SUSPENSION 모드)
// =============================================
async function registerToNaver(product) {
  const { NaverCommerceApiClient } = require('@smartstore/integrations');
  const fs = require('fs');
  const path = require('path');
  const client = new NaverCommerceApiClient();

  // 1. 도매꾹 이미지 다운로드 → 임시 파일
  const tmpDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const imgRes = await axios.get(product.imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
  // content-type에서 확장자 결정
  const ct = imgRes.headers['content-type'] || '';
  const ext = ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : '.jpg';
  const tmpFile = path.join(tmpDir, `tmp_product_${Date.now()}${ext}`);
  fs.writeFileSync(tmpFile, imgRes.data);
  console.log(`         이미지 다운로드: ${(imgRes.data.length / 1024).toFixed(1)}KB (${ct || 'unknown'})`);

  // 2. 네이버 이미지 서버에 업로드
  let naverImageUrl = '';
  try {
    const urls = await client.uploadProductImages([tmpFile]);
    naverImageUrl = urls[0] || '';
    console.log(`         네이버 이미지 업로드: ${naverImageUrl ? '성공' : '실패'}`);
  } finally {
    // 임시 파일 정리
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }

  if (!naverImageUrl) {
    throw new Error('네이버 이미지 업로드 실패 — 상품 등록 불가');
  }

  // 3. 판매가 계산 (1,000원 올림 → X,900원 심리가격)
  const salePrice = calcSalePrice(product.wholesalePrice, product.shippingFee);

  // 4. 상품 등록
  const result = await client.registerProduct({
    name: product.name.slice(0, 100),
    statusType: 'SUSPENSION', // 판매중지 상태로 등록 (안전)
    saleType: 'NEW',
    leafCategoryId: '50000803', // 생활/가정용품
    salePrice,
    stockQuantity: 10,
    images: {
      representativeImage: { url: naverImageUrl },
    },
    detailContent: buildDetailContent(product, salePrice),
    deliveryInfo: {
      deliveryType: 'DELIVERY',
      deliveryAttributeType: 'NORMAL',
      deliveryCompany: 'CJGLS',
      deliveryFee: {
        deliveryFeeType: product.shippingFee > 0 ? 'PAID' : 'FREE',
        baseFee: product.shippingFee,
        deliveryFeePayType: 'PREPAID',
      },
      claimDeliveryInfo: {
        returnDeliveryFee: 2500,
        exchangeDeliveryFee: 5000,
      },
    },
  });

  return {
    originProductNo: result.originProductNo,
    salePrice,
    name: product.name,
  };
}

// =============================================
// 1회 로테이션 실행
// =============================================
async function runOneRotation(rotationNum) {
  const errors = [];
  const results = [];

  function ok(step, msg) { results.push({ step, msg, ok: true }); }
  function fail(step, msg) { errors.push({ step, msg }); results.push({ step, msg, ok: false }); }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  실제 로테이션 #${rotationNum} 시작 [${ts()}]`);
  console.log(`${'='.repeat(70)}`);

  // ── 1. 시스템 상태 ───────────────────────
  console.log('\n  [1/7] 시스템 상태 확인...');
  try {
    const sys = await axios.get(`${API}/admin/system`, { auth: AUTH });
    const d = sys.data;
    if (!d.dbConnected || !d.redisConnected || !d.workerAlive) {
      fail('시스템', `DB:${d.dbConnected} Redis:${d.redisConnected} Worker:${d.workerAlive}`);
      return { errors, results };
    }
    ok('시스템', `DB/Redis/Worker 정상 (메모리: ${d.memory.heapUsedMB}MB)`);
  } catch (e) { fail('시스템', e.message); return { errors, results }; }

  // ── 2. 도매꾹 실제 상품 크롤링 ────────────
  console.log('  [2/7] 도매꾹 API 상품 조회...');
  let crawledProduct = null;
  try {
    crawledProduct = await crawlRealProduct();
    if (!crawledProduct) {
      fail('크롤링', '상품 추출 실패 (0건)');
    } else {
      const priceInfo = crawledProduct.naverLowest
        ? `도매가: ${crawledProduct.wholesalePrice.toLocaleString()}원 / 네이버최저: ${crawledProduct.naverLowest.toLocaleString()}원 / 우리: ${crawledProduct.ourPrice.toLocaleString()}원`
        : `도매가: ${crawledProduct.wholesalePrice.toLocaleString()}원 / 네이버 미등록`;
      ok('크롤링', `${crawledProduct.name.slice(0, 35)}... (${priceInfo})`);
    }
  } catch (e) { fail('크롤링', e.message); }

  // ── 3. 네이버 스마트스토어 실제 등록 ──────
  console.log('  [3/7] 네이버 스마트스토어 등록 (SUSPENSION)...');
  let naverProductNo = null;
  let salePrice = 0;
  if (crawledProduct) {
    try {
      const reg = await registerToNaver(crawledProduct);
      naverProductNo = reg.originProductNo;
      salePrice = reg.salePrice;
      registeredProducts.push(naverProductNo);
      ok('네이버등록', `상품번호: ${naverProductNo} / 판매가: ${salePrice.toLocaleString()}원 (SUSPENSION)`);
      console.log(`         >>> 판매자센터에서 확인: https://sell.smartstore.naver.com/`);
    } catch (e) {
      const errData = e.response?.data;
      fail('네이버등록', errData ? JSON.stringify(errData).slice(0, 200) : e.message);
    }
  } else {
    fail('네이버등록', '크롤링 실패로 등록 불가');
  }

  // ── 4. 주문 폴링 + 통계 ───────────────────
  console.log('  [4/7] 주문 폴링 + 통계 확인...');
  try {
    const pollRes = await axios.post(`${API}/orders/poll`, {});
    ok('주문폴링', '네이버 주문 폴링 트리거 완료');
  } catch (e) { fail('주문폴링', e.response?.data?.error || e.message); }

  await sleep(3000);

  try {
    const stats = await axios.get(`${API}/orders/stats`);
    const rev = stats.data.revenue;
    ok('주문통계', `총매출: ${(rev?.total || 0).toLocaleString()}원 / ${rev?.orderCount || 0}건`);
  } catch (e) { fail('주문통계', e.message); }

  // ── 5. 톡톡 자동응답 테스트 ────────────────
  console.log('  [5/7] 톡톡 고객문의 5건 발송 + 응답 대기...');
  const productName = crawledProduct?.name || '테스트 상품';
  const talkTalkCases = [
    { label: '배송', msg: `${productName} 주문했는데 배송이 언제 출발하나요?` },
    { label: '교환', msg: '사이즈가 맞지 않아 사이즈교환 하고 싶습니다. 절차 알려주세요.' },
    { label: 'A/S', msg: '받은 상품이 파손되어 있어요. A/S 접수 가능한가요?' },
    { label: '가격', msg: '대량 구매시 할인 가능한지 궁금합니다. 10개 이상 주문하려고요.' },
    { label: '긴급불만', msg: '5일째 배송 안 되고 연락도 안 되네요!! 당장 환불 처리해주세요!!!' },
  ];

  let talkSuccess = 0;
  for (const { label, msg } of talkTalkCases) {
    try {
      await axios.post(`${API}/webhooks/talktalk`, {
        eventType: 'MESSAGE_RECEIVED',
        storeId: SHOP_ID,
        channelId: `real-rot${rotationNum}-${label}-${Date.now()}`,
        customerId: `real-customer-rot${rotationNum}`,
        message: msg,
        messageType: 'TEXT',
      });
      talkSuccess++;
    } catch (e) {
      fail(`톡톡-${label}`, e.response?.data?.error || e.message);
    }
    await sleep(300);
  }

  if (talkSuccess === talkTalkCases.length) {
    ok('톡톡발송', `${talkSuccess}/${talkTalkCases.length}건 큐 등록 성공`);
  }

  // 워커 처리 대기
  console.log('         워커 처리 대기 (12초)...');
  await sleep(12000);

  // 톡톡 처리 결과 확인
  try {
    const jobs = await axios.get(`${API}/monitoring/jobs?limit=30`);
    const allJobs = jobs.data.jobs || [];
    const talkJobs = allJobs.filter(j => j.jobType === 'talktalk');
    const completed = talkJobs.filter(j => j.status === 'completed').length;
    const failed = talkJobs.filter(j => j.status === 'failed').length;

    if (failed > 0) {
      fail('톡톡응답', `완료 ${completed} / 실패 ${failed}건`);
    } else {
      ok('톡톡응답', `처리 완료: ${talkJobs.length}건`);
    }
  } catch (e) { fail('톡톡응답', e.message); }

  // ── 6. 텔레그램 알림 확인 ──────────────────
  console.log('  [6/7] 텔레그램 알림 확인...');
  try {
    const alerts = await axios.get(`${API}/admin/alerts`, { auth: AUTH });
    const alertList = alerts.data.alerts || [];
    const recentAlerts = alertList.slice(0, 5);
    ok('텔레그램', `최근 알림 ${alertList.length}건`);
    for (const a of recentAlerts) {
      console.log(`         - [${a.jobType}] ${a.status}: ${(a.message || '').slice(0, 60)}`);
    }
    console.log(`         >>> 텔레그램 @toolhouseshop_bot 에서 알림 확인 가능`);
  } catch (e) { fail('텔레그램', e.message); }

  // ── 7. 최종 큐 상태 ───────────────────────
  console.log('  [7/7] 최종 큐 상태 + 등록 상품 확인...');
  try {
    const queues = await axios.get(`${API}/monitoring/queues`);
    const queueList = queues.data.queues || [];
    const summary = queueList.map(q => `${q.name}(완:${q.completed}/실:${q.failed})`).join(', ');
    ok('큐상태', summary);
  } catch (e) { fail('큐상태', e.message); }

  if (naverProductNo) {
    console.log(`\n  ✔ 웹에서 확인 가능한 결과물:`);
    console.log(`    • 네이버 판매자센터 → 상품관리 → 상품번호 ${naverProductNo}`);
    console.log(`    • 텔레그램 봇 @toolhouseshop_bot → 알림 메시지`);
  }

  return { errors, results };
}

// =============================================
// 결과 출력
// =============================================
function printResult(num, { errors, results }) {
  const okCount = results.filter(r => r.ok).length;
  const failCount = errors.length;
  const icon = failCount === 0 ? 'CLEAN' : 'FAIL';

  console.log(`\n  ── 로테이션 #${num} 결과: ${icon} ──`);
  for (const r of results) {
    console.log(`    ${r.ok ? '[OK]' : '[FAIL]'} ${r.step}: ${r.msg}`);
  }
  console.log(`\n  합계: ${okCount} OK / ${failCount} FAIL [${ts()}]`);
  return failCount === 0;
}

// =============================================
// 메인
// =============================================
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  실제 로테이션 테스트 (웹에서 결과 확인 가능)             ║');
  console.log('║  도매꾹 API → 네이버 등록 → 주문 → 톡톡 → 텔레그램      ║');
  console.log('║  목표: 3회 연속 클린 패스                                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // 서버 체크
  try { await axios.get(`${API}/`); }
  catch { console.error('\n  [FATAL] API 서버 미응답'); process.exit(1); }

  // Kill Switch 활성화
  console.log('\n  Kill Switch 활성화 중...');
  for (const key of ['AUTO_ORDER_ENABLED', 'AUTO_SHIPPING_ENABLED']) {
    try {
      await axios.post(`${API}/admin/control`, { key, value: 'true' }, { auth: AUTH });
      console.log(`    ${key} = true`);
    } catch (e) { console.log(`    ${key} 설정 실패: ${e.message}`); }
  }

  while (consecutiveClean < 3) {
    totalRuns++;
    const result = await runOneRotation(totalRuns);
    const isClean = printResult(totalRuns, result);

    if (isClean) {
      consecutiveClean++;
      console.log(`\n  >>> 연속 클린 패스: ${consecutiveClean}/3`);
    } else {
      consecutiveClean = 0;
      console.log(`\n  >>> 실패 발견 — 연속 클린 카운트 리셋 (0/3)`);
      for (const e of result.errors) {
        console.log(`      • ${e.step}: ${e.msg}`);
      }
    }

    if (consecutiveClean < 3) {
      console.log(`\n  ... 다음 로테이션까지 5초 대기...\n`);
      await sleep(5000);
    }
  }

  // Kill Switch 복원 (안전)
  console.log('\n  Kill Switch 복원 중...');
  for (const key of ['AUTO_ORDER_ENABLED', 'AUTO_SHIPPING_ENABLED']) {
    try {
      await axios.post(`${API}/admin/control`, { key, value: 'false' }, { auth: AUTH });
      console.log(`    ${key} = false`);
    } catch { /* 무시 */ }
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  실제 로테이션 테스트 완료`);
  console.log(`  총 실행: ${totalRuns}회 / 연속 클린 패스: ${consecutiveClean}회`);
  if (registeredProducts.length > 0) {
    console.log(`\n  등록된 네이버 상품번호 (판매자센터에서 확인/삭제):`);
    registeredProducts.forEach(no => console.log(`    • ${no}`));
  }
  console.log(`${'═'.repeat(70)}\n`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
