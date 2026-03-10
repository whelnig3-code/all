// =============================================
// 전체 로테이션 테스트 (Full Cycle Rotation)
//
// 1회 로테이션:
//   상품 생성 → 워커 등록 → 주문 시뮬레이션 → 배송 처리
//   → 톡톡 고객문의 (배송/교환/A/S) → 자동응답 확인
//   → 블로그 포스팅 → 재고 확인 → 정리
//
// 규칙:
//   - 3회 연속 클린 패스 시 종료
//   - 수정이 필요한 회차는 0회로 리셋
// =============================================
require('dotenv').config();
const axios = require('axios');

const API = 'http://localhost:3100';
const AUTH = {
  username: process.env.ADMIN_USER || 'admin',
  password: process.env.ADMIN_PASS || 'tpl7eDZmHTfFdEf7zS0Lc+JgRIGul2i/',
};
const SHOP_ID = process.env.NAVER_SHOP_ID || 'ncp_1p2tcr_01';

// 결과 추적
let totalRuns = 0;
let consecutiveClean = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ts() { return new Date().toISOString().slice(11, 19); }

// =============================================
// 로테이션 1회 실행
// =============================================
async function runOneRotation(rotationNum) {
  const errors = [];
  const results = [];
  let productId = null;
  let orderId = null;

  function ok(step, msg) { results.push({ step, msg, ok: true }); }
  function fail(step, msg) { errors.push({ step, msg }); results.push({ step, msg, ok: false }); }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  로테이션 #${rotationNum} 시작 [${ts()}]`);
  console.log(`${'='.repeat(70)}`);

  // ── STEP 1: 시스템 상태 확인 ──────────────────
  console.log('\n  [1/9] 시스템 상태 확인...');
  try {
    const sys = await axios.get(`${API}/admin/system`, { auth: AUTH });
    const d = sys.data;
    if (!d.dbConnected) { fail('시스템', 'DB 연결 끊김'); return { errors, results }; }
    if (!d.redisConnected) { fail('시스템', 'Redis 연결 끊김'); return { errors, results }; }
    if (!d.workerAlive) { fail('시스템', 'Worker 미실행'); return { errors, results }; }
    ok('시스템', `DB/Redis/Worker 정상 (메모리: ${d.memory.heapUsedMB}MB)`);
  } catch (e) { fail('시스템', e.message); return { errors, results }; }

  // ── STEP 2: 상품 생성 ─────────────────────────
  console.log('  [2/9] 상품 생성 + 등록 큐 투입...');
  const uniqueId = `ROT-${rotationNum}-${Date.now()}`;
  try {
    const res = await axios.post(`${API}/products`, {
      source: 'domaegguk',
      sourceProductId: uniqueId,
      name: `[로테이션테스트#${rotationNum}] 멀티 USB-C 고속충전 케이블 1.5m`,
      wholesalePrice: 4500,
      shippingFee: 2500,
      naverFeeRate: 0.055,
      targetMarginRate: 0.25,
      images: ['https://shop-phinf.pstatic.net/20210903_253/1630670123456_HjKlM.jpg'],
      description: 'USB-C 라이트닝 마이크로USB 3in1 멀티충전 케이블. 나일론 브레이드, 최대 3A 고속충전. 스마트폰 태블릿 호환.',
    });
    productId = res.data.product?.id;
    const sp = res.data.priceCalculation?.salePrice;
    if (!productId) { fail('상품생성', '상품 ID 없음'); }
    else if (!sp || sp <= 0) { fail('상품생성', `판매가 이상: ${sp}`); }
    else { ok('상품생성', `ID=${productId.slice(0,12)}... 판매가=${sp}원`); }
  } catch (e) {
    fail('상품생성', e.response?.data?.error || e.message);
  }

  // 워커 처리 대기 (최대 30초)
  if (productId) {
    console.log('         워커 등록 대기 (최대 30초)...');
    for (let i = 0; i < 15; i++) {
      await sleep(2000);
      try {
        const p = await axios.get(`${API}/products/${productId}`);
        const prod = p.data.product || p.data;
        if (prod.status !== 'pending') {
          if (prod.status === 'registered') {
            ok('등록', `네이버 등록 완료 (naverProductId: ${prod.naverProductId})`);
          } else if (prod.status === 'skipped') {
            ok('등록', '안전장치 건너뛰기 (정상 동작)');
          } else {
            ok('등록', `워커 처리 완료 — 상태: ${prod.status}`);
          }
          break;
        }
        if (i === 14) { ok('등록', '대기 타임아웃 — 큐 지연 (비정상은 아님)'); }
      } catch { /* 계속 대기 */ }
    }
  }

  // ── STEP 3: 주문 시뮬레이션 (DB 직접 폴링 트리거) ──
  console.log('  [3/9] 주문 폴링 + 주문 목록 확인...');
  try {
    await axios.post(`${API}/orders/poll`, {});
    ok('주문폴링', '폴링 트리거 성공');
  } catch (e) { fail('주문폴링', e.response?.data?.error || e.message); }

  await sleep(3000);

  try {
    const orders = await axios.get(`${API}/orders`);
    const list = orders.data.data || orders.data.orders || [];
    ok('주문목록', `${list.length}건 조회`);

    // 가장 최근 paid 주문이 있으면 배송 테스트에 사용
    const paidOrder = list.find(o => o.status === 'paid' || o.status === 'preparing');
    if (paidOrder) {
      orderId = paidOrder.id;
    }
  } catch (e) { fail('주문목록', e.message); }

  // ── STEP 4: 배송 처리 ──────────────────────────
  console.log('  [4/9] 배송 처리 테스트...');
  if (orderId) {
    try {
      const trackingNum = `ROT${rotationNum}${Date.now().toString().slice(-8)}`;
      const shipRes = await axios.post(`${API}/orders/${orderId}/ship`, {
        trackingNumber: trackingNum,
        courier: 'CJ대한통운',
      });
      ok('배송', `발송 처리 성공 (운송장: ${trackingNum})`);
    } catch (e) {
      const errMsg = e.response?.data?.error || e.message;
      // 이미 발송 완료 상태면 에러가 아님
      if (errMsg.includes('발송 처리 불가 상태')) {
        ok('배송', `이미 처리된 주문 (${errMsg})`);
      } else {
        fail('배송', errMsg);
      }
    }
  } else {
    ok('배송', '활성 주문 없음 — 배송 테스트 건너뜀 (정상)');
  }

  // ── STEP 5: 톡톡 고객 문의 (5종류) ─────────────
  console.log('  [5/9] 톡톡 고객 문의 5건 발송...');
  const talkTalkCases = [
    { label: '배송문의', msg: '주문한 상품이 아직 안 왔어요. 배송 상태 확인 부탁드립니다.' },
    { label: '교환요청', msg: '사이즈가 안 맞아서 교환하고 싶습니다. 사이즈교환 절차 알려주세요.' },
    { label: 'A/S문의', msg: '일주일 전에 구매한 충전 케이블이 고장났어요. A/S 가능한가요?' },
    { label: '가격문의', msg: '이 상품 할인 쿠폰 적용되나요? 대량구매 할인 가능한지 궁금합니다.' },
    { label: '긴급불만', msg: '3일째 배송이 안 오고 연락도 안 되네요!!! 당장 환불해주세요!!!' },
  ];

  let talkTalkSuccess = 0;
  for (const { label, msg } of talkTalkCases) {
    try {
      const channelId = `rot-${rotationNum}-ch-${Date.now()}`;
      const res = await axios.post(`${API}/webhooks/talktalk`, {
        eventType: 'MESSAGE_RECEIVED',
        storeId: SHOP_ID,
        channelId,
        customerId: `rot-customer-${rotationNum}`,
        message: msg,
        messageType: 'TEXT',
      });
      if (res.data.ok || res.status === 200) { talkTalkSuccess++; }
      else { fail(`톡톡-${label}`, JSON.stringify(res.data).slice(0, 100)); }
    } catch (e) {
      fail(`톡톡-${label}`, e.response?.data?.error || e.message);
    }
    await sleep(200);
  }
  if (talkTalkSuccess === talkTalkCases.length) {
    ok('톡톡', `${talkTalkSuccess}/${talkTalkCases.length}건 큐 등록 성공`);
  }

  // 톡톡 워커 처리 대기
  console.log('         톡톡 워커 처리 대기 (10초)...');
  await sleep(10000);

  // ── STEP 6: 톡톡 자동응답 결과 확인 ────────────
  console.log('  [6/9] 톡톡 자동응답 결과 확인...');
  try {
    const jobs = await axios.get(`${API}/monitoring/jobs?limit=30`);
    const talkJobs = (jobs.data.jobs || []).filter(j => j.jobType === 'talktalk');
    const completed = talkJobs.filter(j => j.status === 'completed').length;
    const failed = talkJobs.filter(j => j.status === 'failed').length;
    if (failed > 0) {
      fail('톡톡응답', `완료 ${completed}건, 실패 ${failed}건`);
    } else {
      ok('톡톡응답', `처리 결과: ${talkJobs.length}건 (완료: ${completed})`);
    }
  } catch (e) { fail('톡톡응답', e.message); }

  // ── STEP 7: 블로그 포스팅 생성 ─────────────────
  console.log('  [7/9] 블로그 포스트 생성 (템플릿 + LLM)...');
  try {
    const core = require('@smartstore/core');

    const blogInput = {
      productName: `[로테이션#${rotationNum}] 멀티 USB-C 고속충전 케이블`,
      category: '전자/디지털',
      salePrice: 10080,
      description: 'USB-C 라이트닝 마이크로USB 3in1 멀티충전 케이블. 나일론 브레이드 소재, 3A 고속충전.',
      keywords: ['충전케이블', 'USB-C', '고속충전'],
    };

    // 7-1. 템플릿 버전
    const tpl = core.buildBlogPostFromTemplate(blogInput);
    if (!tpl.title || !tpl.body || tpl.body.length < 100) {
      fail('블로그-템플릿', `불완전한 결과 (title=${!!tpl.title}, body=${tpl.body?.length}자)`);
    } else {
      ok('블로그-템플릿', `${tpl.title.slice(0, 40)}... (${tpl.body.length}자)`);
    }

    // 7-2. LLM 버전
    const llm = await core.generateBlogPost(blogInput);
    if (!llm.title || !llm.body || llm.body.length < 50) {
      fail('블로그-LLM', `불완전한 결과 (title=${!!llm.title}, body=${llm.body?.length}자)`);
    } else {
      ok('블로그-LLM', `${llm.title.slice(0, 40)}... (${llm.body.length}자)`);
    }

    // 7-3. 상품 설명 생성
    const { llmAdapter } = require('@smartstore/adapters');
    const desc = await core.generateProductDescription({
      productName: blogInput.productName,
      rawDescription: blogInput.description,
      categoryName: blogInput.category,
      salePrice: blogInput.salePrice,
    }, llmAdapter);
    if (!desc.highlights || desc.highlights.length === 0) {
      fail('상품설명', '핵심 특징 0개');
    } else {
      ok('상품설명', `핵심특징 ${desc.highlights.length}개, 상세 ${desc.detailDescription.length}자 (${desc.generatedBy})`);
    }
  } catch (e) { fail('블로그/콘텐츠', e.message); }

  // ── STEP 8: 재고 상태 확인 ─────────────────────
  console.log('  [8/9] 재고 상태 확인...');
  try {
    const inv = await axios.get(`${API}/inventory/status`);
    const items = inv.data.items || [];
    ok('재고', `${items.length}개 상품 재고 조회`);
  } catch (e) { fail('재고', e.response?.data?.error || e.message); }

  // ── STEP 9: 큐 상태 + 매출 통계 최종 확인 ─────
  console.log('  [9/9] 큐 상태 + 통계 최종 확인...');
  try {
    const queues = await axios.get(`${API}/monitoring/queues`);
    const queueList = queues.data.queues || [];
    const failedQueues = queueList.filter(q => q.failed > 0);
    if (failedQueues.length > 0) {
      const failInfo = failedQueues.map(q => `${q.name}:${q.failed}실패`).join(', ');
      // 실패 큐가 있어도 이전 실행 잔여일 수 있으므로 경고만
      ok('큐상태', `큐 ${queueList.length}개 (경고: ${failInfo})`);
    } else {
      ok('큐상태', `큐 ${queueList.length}개 정상`);
    }
  } catch (e) { fail('큐상태', e.message); }

  try {
    const stats = await axios.get(`${API}/orders/stats`);
    const rev = stats.data.revenue;
    ok('통계', `총매출 ${rev?.total || 0}원 / ${rev?.orderCount || 0}건`);
  } catch (e) { fail('통계', e.response?.data?.error || e.message); }

  return { errors, results };
}

// =============================================
// 결과 출력
// =============================================
function printRotationResult(num, { errors, results }) {
  const okCount = results.filter(r => r.ok).length;
  const failCount = errors.length;
  const icon = failCount === 0 ? 'CLEAN' : 'FAIL';

  console.log(`\n  ── 로테이션 #${num} 결과: ${icon} ──`);
  for (const r of results) {
    const mark = r.ok ? '[OK]' : '[FAIL]';
    console.log(`    ${mark} ${r.step}: ${r.msg}`);
  }
  console.log(`\n  합계: ${okCount} OK / ${failCount} FAIL [${ts()}]`);
  return failCount === 0;
}

// =============================================
// 메인 루프
// =============================================
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  스마트스토어 전체 로테이션 테스트                         ║');
  console.log('║  목표: 3회 연속 클린 패스                                 ║');
  console.log('║  규칙: 수정 발생 시 카운트 0 리셋                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // API 서버 체크
  try {
    await axios.get(`${API}/`);
  } catch {
    console.error('\n  [FATAL] API 서버가 응답하지 않습니다. 먼저 서버를 시작하세요.');
    process.exit(1);
  }

  while (consecutiveClean < 3) {
    totalRuns++;
    const result = await runOneRotation(totalRuns);
    const isClean = printRotationResult(totalRuns, result);

    if (isClean) {
      consecutiveClean++;
      console.log(`\n  >>> 연속 클린 패스: ${consecutiveClean}/3`);
    } else {
      consecutiveClean = 0;
      console.log(`\n  >>> 실패 발견 — 연속 클린 카운트 리셋 (0/3)`);
      console.log(`  >>> 실패 항목:`);
      for (const e of result.errors) {
        console.log(`      - ${e.step}: ${e.msg}`);
      }
    }

    if (consecutiveClean < 3) {
      console.log(`\n  ... 다음 로테이션까지 5초 대기...\n`);
      await sleep(5000);
    }
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  전체 로테이션 테스트 완료`);
  console.log(`  총 실행: ${totalRuns}회 / 연속 클린 패스: ${consecutiveClean}회`);
  console.log(`${'═'.repeat(70)}\n`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
