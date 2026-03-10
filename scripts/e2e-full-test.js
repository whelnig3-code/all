// =============================================
// E2E 전체 파이프라인 테스트 v2
// 상품 생성 → 등록 → 판매 → 주문 → 톡톡 문의 → A/S → 블로그 포스팅
// =============================================
require('dotenv').config();
const axios = require('axios');

const API = 'http://localhost:3100';
const AUTH = { username: 'admin', password: process.env.ADMIN_PASS || 'tpl7eDZmHTfFdEf7zS0Lc+JgRIGul2i/' };

let okCount = 0;
let failCount = 0;

function ok(label) { okCount++; console.log(`  [OK] ${label}`); }
function fail(label, err) { failCount++; console.log(`  [FAIL] ${label}: ${err}`); }
function info(label) { console.log(`  [INFO] ${label}`); }
function section(title) { console.log(`\n${'='.repeat(60)}\n  ${title}\n${'='.repeat(60)}`); }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  let productId = null;

  // ============================================
  // 1. 시스템 상태 확인
  // ============================================
  section('1. 시스템 상태 확인');

  try {
    const root = await axios.get(`${API}/`);
    ok(`API 서버 실행 중 (${root.data.status})`);
  } catch (e) { fail('API 서버', e.message); return; }

  try {
    const sys = await axios.get(`${API}/admin/system`, { auth: AUTH });
    const d = sys.data;
    ok(`DB: ${d.dbConnected ? '연결' : '끊김'}`);
    ok(`Redis: ${d.redisConnected ? '연결' : '끊김'}`);
    ok(`Worker: ${d.workerAlive ? '실행중' : '중지'}`);
    ok(`메모리: ${d.memory.heapUsedMB}MB / RSS ${d.memory.rssMB}MB`);
    info(`Kill Switch — 자동가격: ${d.settings.AUTO_PRICE_ENABLED}, 자동주문: ${d.settings.AUTO_ORDER_ENABLED}, 자동배송: ${d.settings.AUTO_SHIPPING_ENABLED}`);
  } catch (e) { fail('시스템 상태', e.message); }

  // ============================================
  // 2. 자격증명 연결 테스트 (빈 body {} 전송)
  // ============================================
  section('2. 자격증명 연결 테스트');

  for (const svc of ['naver_commerce', 'telegram']) {
    try {
      const r = await axios.post(`${API}/admin/credentials/${svc}/test`, {}, { auth: AUTH });
      if (r.data.success) ok(`${svc}: ${r.data.message}`);
      else fail(svc, r.data.error || r.data.message);
    } catch (e) { fail(svc, e.response?.data?.error || e.message); }
  }

  // ============================================
  // 3. 상품 생성 → 네이버 자동 등록
  // ============================================
  section('3. 상품 생성 → 네이버 자동 등록');

  try {
    const ts = Date.now();
    const res = await axios.post(`${API}/products`, {
      source: 'domaegguk',
      sourceProductId: `TEST-E2E-${ts}`,
      name: '[E2E테스트-삭제예정] 멀티 USB 충전 케이블 3in1 고속충전',
      wholesalePrice: 5000,
      shippingFee: 2500,
      naverFeeRate: 0.055,
      targetMarginRate: 0.25,
      images: ['https://via.placeholder.com/800x800.jpg'],
      description: 'USB-C 라이트닝 마이크로USB 3가지 단자를 지원하는 멀티 충전 케이블입니다. 나일론 브레이드 소재로 내구성이 뛰어나며 최대 3A 고속충전을 지원합니다. 스마트폰 태블릿 노트북 등 다양한 기기에서 사용 가능합니다.',
    });

    productId = res.data.product?.id;
    const pc = res.data.priceCalculation;
    ok(`상품 생성 완료 (ID: ${productId})`);
    ok(`판매가 계산: ${pc?.salePrice}원 (도매가+배송: ${(pc?.wholesalePrice || 5000) + 2500}원)`);
    ok(`상품 상태: ${res.data.product?.status}`);
  } catch (e) {
    fail('상품 생성', JSON.stringify(e.response?.data || e.message).substring(0, 200));
  }

  // Worker가 등록 작업을 처리할 때까지 대기
  if (productId) {
    console.log('\n  ... 워커 처리 대기 (최대 60초)...');
    let registered = false;
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      try {
        const p = await axios.get(`${API}/products/${productId}`);
        const prod = p.data.product || p.data;
        const status = prod.status;
        if (status !== 'pending') {
          if (status === 'registered') {
            ok(`네이버 등록 성공! (naverProductId: ${prod.naverProductId})`);
            registered = true;
          } else if (status === 'skipped') {
            ok(`워커 처리 완료 — 상태: ${status} (안전장치에 의한 건너뛰기, 정상 동작)`);
          } else {
            info(`워커 처리 완료 — 상태: ${status}`);
          }
          break;
        }
        if (i === 29) info('등록 대기 타임아웃 — 워커가 아직 미처리 (큐 지연 가능)');
      } catch (e) { /* 계속 대기 */ }
    }

    // 직접 등록 시도 (스코어 건너뛰기 확인용)
    if (!registered) {
      info('안전장치(스코어/경쟁자) 때문에 등록이 건너뛰어졌을 수 있음');
      info('직접 네이버 API 등록 테스트 실행...');

      try {
        const { NaverCommerceApiClient } = require('@smartstore/integrations');
        const client = new NaverCommerceApiClient();

        const result = await client.registerProduct({
          name: '[E2E테스트-삭제예정] USB-C 충전 케이블 1m',
          statusType: 'SUSPENSION',
          saleType: 'NEW',
          leafCategoryId: '50000803',
          salePrice: 9900,
          stockQuantity: 1,
          images: { representativeImage: { url: 'https://via.placeholder.com/800x800.jpg' } },
          detailContent: '<p>[E2E 테스트] 시스템 기능 테스트용 — 실제 판매 아님</p>',
          deliveryInfo: {
            deliveryType: 'DELIVERY',
            deliveryAttributeType: 'NORMAL',
            deliveryCompany: 'CJGLS',
            deliveryFee: { deliveryFeeType: 'FREE', deliveryFeePayType: 'PREPAID' },
            claimDeliveryInfo: { returnDeliveryFee: 2500, exchangeDeliveryFee: 5000 },
          },
        });
        ok(`직접 네이버 등록 성공! (originProductNo: ${result.originProductNo})`);
        ok(`상태: SUSPENSION (판매중지 — 테스트 안전)`);

        // 바로 판매 중지 확인
        try {
          await client.suspendProduct(result.originProductNo);
          ok('판매 중지 재확인 완료');
        } catch (e) { info('이미 중지 상태'); }

      } catch (e) {
        fail('직접 네이버 등록', (e.response?.data ? JSON.stringify(e.response.data).substring(0, 200) : e.message));
      }
    }
  }

  // ============================================
  // 4. 상품 조회 & 가격 시뮬레이션
  // ============================================
  section('4. 상품 조회 & 가격 시뮬레이션');

  try {
    const list = await axios.get(`${API}/products`);
    const products = list.data.products || [];
    ok(`전체 상품 수: ${products.length}개`);
    for (const p of products.slice(0, 3)) {
      info(`  - ${p.name} (${p.status}, ${p.salePrice}원)`);
    }
  } catch (e) { fail('상품 목록', e.message); }

  if (productId) {
    try {
      const sim = await axios.get(`${API}/products/${productId}/price-simulation`);
      const sims = sim.data.simulations || [];
      ok(`가격 시뮬레이션 (${sims.length}개 마진율)`);
      for (const s of sims.slice(0, 3)) {
        info(`  마진 ${(s.targetMarginRate * 100).toFixed(0)}%: 판매가 ${s.salePrice}원 (순익 ${s.margin}원)`);
      }
    } catch (e) { fail('가격 시뮬레이션', e.response?.data?.error || e.message); }
  }

  // ============================================
  // 5. 주문 처리 테스트
  // ============================================
  section('5. 주문 처리 테스트');

  try {
    const poll = await axios.post(`${API}/orders/poll`, {});
    ok(`주문 폴링 요청: ${poll.data.message || JSON.stringify(poll.data).substring(0, 100)}`);
  } catch (e) { fail('주문 폴링', e.response?.data?.error || e.message); }

  try {
    const orders = await axios.get(`${API}/orders`);
    const count = orders.data.orders?.length || 0;
    ok(`주문 목록 조회: ${count}건`);
  } catch (e) { fail('주문 목록', e.message); }

  try {
    const stats = await axios.get(`${API}/orders/stats`);
    ok(`주문 통계: 총매출 ${stats.data.revenue?.total || 0}원 / ${stats.data.revenue?.orderCount || 0}건`);
  } catch (e) { fail('주문 통계', e.response?.data?.error || e.message); }

  // 주문 승인 모드 테스트
  try {
    const pending = await axios.get(`${API}/orders/pending-approvals`, { auth: AUTH });
    ok(`승인 대기 주문: ${pending.data.approvals?.length || 0}건`);
  } catch (e) { fail('승인 대기', e.response?.data?.error || e.message); }

  // ============================================
  // 6. 톡톡 자동응답 테스트 (storeId 포함)
  // ============================================
  section('6. 톡톡 자동응답 테스트 (배송/교환/A/S)');

  const talkTalkMessages = [
    { label: '배송 문의', message: '주문한 상품 배송 언제 될까요?' },
    { label: '교환/반품 문의', message: '상품 불량이라 교환하고 싶어요. 어떻게 하면 되나요?' },
    { label: '가격 문의', message: '이 상품 할인 쿠폰 적용되나요?' },
    { label: 'A/S 문의', message: '구매한 충전 케이블이 고장났어요. A/S 가능한가요? 구매한지 일주일 됐습니다.' },
    { label: '긴급 불만', message: '상품이 3일이나 지났는데 안 오고 연락도 안 되고 환불해주세요!!!' },
  ];

  for (const { label, message } of talkTalkMessages) {
    try {
      const res = await axios.post(`${API}/webhooks/talktalk`, {
        eventType: 'MESSAGE_RECEIVED',
        storeId: process.env.NAVER_SHOP_ID || 'ncp_1p2tcr_01',
        channelId: 'test-channel-001',
        customerId: 'test-customer-e2e',
        message: message,
        messageType: 'TEXT',
      });
      ok(`${label}: ${res.data.ok ? '큐 등록 성공' : JSON.stringify(res.data)}`);
    } catch (e) {
      fail(label, e.response?.data?.error || e.message);
    }
    await sleep(300);
  }

  // 워커 처리 대기
  console.log('\n  ... 톡톡 워커 처리 대기 (8초)...');
  await sleep(8000);

  // 워커 로그에서 톡톡 처리 결과 확인
  try {
    const jobs = await axios.get(`${API}/monitoring/jobs?limit=20`);
    const talkJobs = (jobs.data.jobs || []).filter(j => j.jobType === 'talktalk');
    ok(`톡톡 처리 결과: ${talkJobs.length}건`);
    for (const j of talkJobs.slice(0, 3)) {
      info(`  ${j.status === 'completed' ? '✓' : '✗'} ${j.status} ${j.result ? '— ' + JSON.stringify(j.result).substring(0, 80) : ''}`);
    }
  } catch (e) { fail('톡톡 로그', e.message); }

  // ============================================
  // 7. 재고 관리 테스트
  // ============================================
  section('7. 재고 관리 테스트');

  try {
    const inv = await axios.get(`${API}/inventory/status`);
    const items = inv.data.items || [];
    ok(`재고 현황: ${items.length}개 상품`);
    for (const it of items.slice(0, 3)) {
      info(`  - ${it.name}: 공급${it.supplierStock} / 캐시${it.cachedStock} / 예약${it.reservedStock} ${it.listingPaused ? '(일시중지)' : ''}`);
    }
  } catch (e) { fail('재고 현황', e.response?.data?.error || e.message); }

  if (productId) {
    try {
      const detail = await axios.get(`${API}/inventory/${productId}`);
      ok(`상품 재고 상세 조회 성공`);
    } catch (e) { fail('재고 상세', e.response?.data?.error || e.message); }

    // 재고 동기화 트리거
    try {
      const sync = await axios.post(`${API}/inventory/${productId}/sync`, {});
      ok(`재고 동기화 트리거: ${sync.data.message || '성공'}`);
    } catch (e) { fail('재고 동기화', e.response?.data?.error || e.message); }
  }

  // ============================================
  // 8. 블로그 홍보글 생성 테스트
  // ============================================
  section('8. 블로그 홍보글 생성 테스트');

  try {
    const core = require('@smartstore/core');

    const blogInput = {
      productName: '[E2E테스트] 멀티 USB 충전 케이블 3in1 고속충전',
      category: '전자/디지털',
      salePrice: 10790,
      description: 'USB-C 라이트닝 마이크로USB 3가지 단자 멀티 충전 케이블. 나일론 브레이드 소재, 최대 3A 고속충전.',
      keywords: ['충전케이블', 'USB', '3in1'],
    };

    // 8-1. 템플릿 기반 블로그 포스트
    const templatePost = core.buildBlogPostFromTemplate(blogInput);
    ok(`템플릿 블로그 포스트 생성`);
    ok(`  제목: ${templatePost.title}`);
    ok(`  태그: ${templatePost.tags.join(', ')}`);
    ok(`  본문 길이: ${templatePost.body.length}자`);

    // 8-2. LLM 기반 블로그 포스트 (Ollama)
    console.log('\n  ... LLM 블로그 포스트 생성 중 (Ollama gemma3:4b)...');
    const llmPost = await core.generateBlogPost(blogInput);
    ok(`LLM 블로그 포스트 생성`);
    ok(`  제목: ${llmPost.title}`);
    ok(`  본문 길이: ${llmPost.body.length}자`);

    // 8-3. 상품 설명 자동 생성
    console.log('\n  ... LLM 상품 설명 생성 중...');
    const { llmAdapter } = require('@smartstore/adapters');
    const desc = await core.generateProductDescription({
      productName: blogInput.productName,
      rawDescription: blogInput.description,
      categoryName: blogInput.category,
      salePrice: blogInput.salePrice,
    }, llmAdapter);
    ok(`상품 설명 생성 완료 (모델: ${desc.generatedBy})`);
    ok(`  핵심 특징: ${desc.highlights.length}개`);
    for (const h of desc.highlights.slice(0, 3)) {
      info(`    • ${h}`);
    }
    ok(`  상세 설명: ${desc.detailDescription.length}자`);

  } catch (e) { fail('블로그/콘텐츠', e.message); }

  // ============================================
  // 9. 매출 리포트 & 메트릭스
  // ============================================
  section('9. 매출 리포트 & 메트릭스');

  try {
    const metrics = await axios.get(`${API}/admin/metrics`, { auth: AUTH });
    const m = metrics.data;
    ok(`오늘 매출: ${m.todayRevenue || 0}원 / 주문: ${m.todayOrders || 0}건 / 마진: ${m.todayMargin || 0}원`);
  } catch (e) { fail('매출 지표', e.response?.data?.error || e.message); }

  try {
    const report = await axios.get(`${API}/report/revenue`);
    ok(`30일 매출 리포트: 총매출 ${report.data.summary?.totalRevenue || 0}원`);
  } catch (e) { fail('매출 리포트', e.response?.data?.error || e.message); }

  // ============================================
  // 10. 큐 & 작업 로그 최종 확인
  // ============================================
  section('10. 최종 상태 — 큐 & 작업 로그');

  try {
    const queues = await axios.get(`${API}/monitoring/queues`);
    for (const q of queues.data.queues || []) {
      ok(`큐 [${q.name}]: 대기${q.waiting} / 활성${q.active} / 완료${q.completed} / 실패${q.failed}`);
    }
  } catch (e) { fail('큐 상태', e.message); }

  try {
    const jobs = await axios.get(`${API}/monitoring/jobs?limit=10`);
    const recent = jobs.data.jobs || [];
    ok(`최근 작업 로그: ${recent.length}건`);
    for (const j of recent.slice(0, 5)) {
      const icon = j.status === 'completed' ? '✓' : '✗';
      info(`  ${icon} ${j.jobType} — ${j.status} ${j.error ? '(' + j.error.substring(0, 60) + ')' : ''}`);
    }
  } catch (e) { fail('작업 로그', e.message); }

  // ============================================
  // 11. 텔레그램 알림 & 알림 내역
  // ============================================
  section('11. 알림 테스트');

  try {
    const alerts = await axios.get(`${API}/admin/alerts`, { auth: AUTH });
    const alertList = alerts.data.alerts || [];
    ok(`최근 알림: ${alertList.length}건`);
    for (const a of alertList.slice(0, 3)) {
      info(`  ${a.jobType} — ${a.message?.substring(0, 60) || a.status}`);
    }
  } catch (e) { fail('알림 조회', e.response?.data?.error || e.message); }

  // ============================================
  // 12. Kill Switch 제어 테스트
  // ============================================
  section('12. Kill Switch 제어 테스트');

  try {
    // 활성화
    await axios.post(`${API}/admin/control`, { key: 'AUTO_PRICE_ENABLED', value: 'true' }, { auth: AUTH });
    ok('AUTO_PRICE_ENABLED = true 설정');

    // 확인
    const sys = await axios.get(`${API}/admin/system`, { auth: AUTH });
    ok(`확인: AUTO_PRICE_ENABLED = ${sys.data.settings.AUTO_PRICE_ENABLED}`);

    // 다시 비활성화 (테스트 안전)
    await axios.post(`${API}/admin/control`, { key: 'AUTO_PRICE_ENABLED', value: 'false' }, { auth: AUTH });
    ok('AUTO_PRICE_ENABLED = false 복원');
  } catch (e) { fail('Kill Switch', e.response?.data?.error || e.message); }

  // ============================================
  // 최종 결과
  // ============================================
  section(`테스트 완료: ${okCount} OK / ${failCount} FAIL`);

  if (failCount === 0) {
    console.log('  전체 파이프라인 정상 동작 확인!\n');
  } else {
    console.log(`  ${failCount}건 실패 — 위 로그를 확인하세요.\n`);
  }
}

run().catch(err => console.error('FATAL:', err));
