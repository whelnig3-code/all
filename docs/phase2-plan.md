# Phase 2 구현 계획: 자동화 로직

> 작성일: 2026-02-28 | 담당: @developer

---

## 1. 현황 분석 (Phase 1 완료 자산)

Phase 1에서 이미 구현된 자산을 Phase 2에서 최대한 활용한다.

| 파일 | 상태 | Phase 2 활용 |
|------|------|------------|
| `packages/integrations/src/naver/commerce-api.ts` | ✅ 완성 | 그대로 사용 |
| `packages/integrations/src/naver/product.ts` | ✅ 완성 | 그대로 사용 |
| `packages/integrations/src/naver/order.ts` | ✅ 완성 | 그대로 사용 |
| `packages/integrations/src/naver/types.ts` | ✅ 완성 | 그대로 사용 |
| `apps/worker/src/queues.ts` | ✅ 완성 (4개 큐 정의됨) | 그대로 사용 |
| `apps/worker/src/jobs/registration.job.ts` | ✅ 완성 | 그대로 사용 |
| `apps/worker/src/jobs/order.job.ts` | ⚠️ 부분 완성 | 고객정보 매핑 수정 |
| `packages/adapters/src/notification/telegram.ts` | ✅ 완성 | 그대로 사용 |
| `packages/db/prisma/schema.prisma` | ✅ 완성 | 그대로 사용 |
| `packages/core/src/safety/guards.ts` | ✅ 완성 | 가격 조정에 연동 |

---

## 2. Phase 2 구현 범위

CLAUDE.md Phase 2 항목:
- [ ] 네이버 상품 자동 등록 API ← 인프라 연결 마무리
- [ ] 주문 자동 확인 및 처리 ← order.job 완성
- [ ] 자동 배송 알림 발송 ← 신규 워커
- [ ] 경쟁가 모니터링 및 가격 조정 ← 신규 크롤러 + 워커

---

## 3. 구현할 파일 목록 (우선순위순)

### 3-1. 워커 메인 진입점 + 스케줄러 ⭐ 최우선
**파일:** `apps/worker/src/index.ts`

- registration.job, order.job, shipping-notification.job, price-monitor.job 워커 4개 시작
- node-cron 스케줄러:
  - `*/5 * * * *` (5분) → `pollAndEnqueueNewOrders()` 호출
  - `0 * * * *` (1시간) → 등록된 상품 전체 경쟁가 체크 큐에 추가
  - `0 9 * * *` (매일 오전 9시) → `enqueuePendingProducts()` 호출
- 프로세스 종료 시 워커 graceful shutdown

```typescript
// 의존성
import cron from 'node-cron'
import { createRegistrationWorker, enqueuePendingProducts } from './jobs/registration.job'
import { createOrderWorker, pollAndEnqueueNewOrders } from './jobs/order.job'
import { createShippingNotificationWorker } from './jobs/shipping-notification.job'
import { createPriceMonitorWorker, enqueueAllProductsForPriceCheck } from './jobs/price-monitor.job'
```

---

### 3-2. order.job.ts 수정 ⭐ 최우선
**파일:** `apps/worker/src/jobs/order.job.ts` (기존 파일 수정)

현재 문제: `createOrderWorker` 내부에서 고객 정보(customerName, customerPhone, customerAddress)가 빈 문자열로 저장됨.

수정 방향:
- `pollAndEnqueueNewOrders`에서 `NaverOrderItem` 전체를 job.data에 포함
- `OrderJobData` 타입에 `orderItem?: NaverOrderItem` 필드 추가
- 워커에서 orderItem이 있으면 바로 사용, 없으면 네이버 API 재조회

```typescript
// queues.ts에 추가
export interface OrderJobData {
  naverOrderId: string
  trigger: 'poll' | 'webhook'
  orderItem?: NaverOrderItem  // 추가: 폴링 시 전달받은 원본 데이터
}
```

---

### 3-3. 발송 알림 워커 ⭐ 신규
**파일:** `apps/worker/src/jobs/shipping-notification.job.ts`

역할:
- `shipping-notification` 큐에서 `ShippingNotificationJobData` 소비
- 네이버 `confirmShipping()` 호출로 운송장 등록
- 텔레그램으로 발송 알림 전송: "📦 발송 완료 - {상품명}, 운송장: {번호}"
- DB Order 상태 → `'shipped'`, `shippedAt` 업데이트

```typescript
export interface ShippingNotificationJobData {
  orderId: string
  productOrderId: string
  trackingNumber: string
  courier: string
  customerName: string
  productName: string
}
```

발송 알림 큐 트리거 시점: 도매처에서 운송장 번호를 받은 후 (현재는 수동, Phase 3에서 자동화)

---

### 3-4. 네이버 쇼핑 가격 모니터 크롤러 ⭐ 신규
**파일:** `packages/crawlers/naver-shopping/src/index.ts`

역할:
- Playwright로 `search.shopping.naver.com` 검색
- 동일/유사 상품의 경쟁사 판매가 상위 5개 추출
- `CompetitorPriceResult[]` 반환

robots.txt 준수 (BaseCrawler 상속):
- 요청 간 2~5초 랜덤 지연
- User-Agent 변경

```typescript
export interface CompetitorPriceResult {
  competitorName: string
  price: number
  rank: number
  productUrl: string
  checkedAt: Date
}

export async function fetchCompetitorPrices(
  productName: string,
  maxResults: number = 5
): Promise<CompetitorPriceResult[]>
```

---

### 3-5. 가격 자동 조정 엔진 ⭐ 신규
**파일:** `packages/core/src/pricing/price-adjuster.ts`

전략:
- 경쟁사 최저가보다 **10~30원 낮게** 설정 (기본값: -10원)
- 단, `MIN_MARGIN_RATE (15%)` 하한선 보장 (guards.ts 연동)
- 마진 하한선에 걸리면 조정 포기 + 알림 발송

```typescript
export interface PriceAdjustmentInput {
  currentPrice: number
  wholesalePrice: number
  shippingFee: number
  naverFeeRate: number
  competitorMinPrice: number
  underCutAmount?: number  // 기본값: 10
}

export interface PriceAdjustmentOutput {
  shouldAdjust: boolean
  newPrice: number
  reason: string
  blockedByMarginGuard: boolean
}

export function calculateAdjustedPrice(input: PriceAdjustmentInput): PriceAdjustmentOutput
```

---

### 3-6. 경쟁가 모니터링 워커 ⭐ 신규
**파일:** `apps/worker/src/jobs/price-monitor.job.ts`

역할:
- `price-monitor` 큐에서 `PriceMonitorJobData` 소비
- 네이버 쇼핑 크롤러로 경쟁사 가격 조회
- `price-adjuster.ts`로 조정 필요 여부 판단
- 필요 시 `naverCommerceApi.updatePrice()` 호출
- `competitor_prices` 테이블 저장 + `price_histories` 테이블 저장
- 가격 변경 시 텔레그램 알림

```typescript
// 스케줄링: 1시간마다 전체 등록 상품 대상
export async function enqueueAllProductsForPriceCheck(
  priceMonitorQueue: Queue
): Promise<number>
```

---

### 3-7. API 서버 최소 구현 (선택)
**파일:** `apps/api-server/src/index.ts`

필요 최소 엔드포인트:
```
GET  /health           → 헬스체크
POST /webhooks/naver   → 네이버 주문 웹훅 수신 (향후)
POST /admin/products/enqueue  → 수동 등록 큐 추가
POST /admin/prices/check      → 수동 경쟁가 체크 트리거
GET  /admin/queues/stats      → 큐 상태 조회
```

---

## 4. 의존성 추가

```json
// apps/worker/package.json에 추가
{
  "dependencies": {
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@types/node-cron": "^3.0.11"
  }
}
```

---

## 5. 구현 순서 (의존성 고려)

```
Step 1: queues.ts OrderJobData 타입 수정
        └─ order.job.ts 고객정보 매핑 수정

Step 2: packages/core/src/pricing/price-adjuster.ts
        └─ 안전장치(guards.ts) 연동 테스트

Step 3: packages/crawlers/naver-shopping/src/index.ts
        └─ Playwright 크롤러 구현 + 단위 테스트

Step 4: apps/worker/src/jobs/shipping-notification.job.ts
        └─ 텔레그램 + confirmShipping + DB 업데이트

Step 5: apps/worker/src/jobs/price-monitor.job.ts
        └─ 크롤러 + price-adjuster + API 호출 통합

Step 6: apps/worker/src/index.ts
        └─ 모든 워커 시작 + cron 스케줄러

Step 7: apps/api-server/ (선택)
        └─ Fastify 최소 API 서버
```

---

## 6. 핵심 제약 사항 (CLAUDE.md 준수)

| 규칙 | 적용 위치 |
|------|---------|
| 네이버 API Rate limit: 초당 1건 이하 | price-monitor.job.ts의 updatePrice 호출 시 sleep(1000) |
| 마진율 15% 하한선 절대 준수 | price-adjuster.ts에서 guards.ts 연동 |
| 크롤링 robots.txt 준수 | NaverShoppingCrawler가 BaseCrawler 상속 |
| 크롤링 요청 2~5초 랜덤 지연 | NaverShoppingCrawler 내부 구현 |
| 고객 전화번호 암호화 | order.job.ts에서 @encrypted 주석 필수 |

---

## 7. 테스트 계획

| 파일 | 테스트 내용 |
|------|-----------|
| `price-adjuster.test.ts` | 마진 하한선 경계값, 언더컷 계산, 조정 불필요 케이스 |
| `naver-shopping.test.ts` | 크롤러 목(mock) 테스트 |
| `shipping-notification.test.ts` | confirmShipping 성공/실패, 알림 전송 |
| `price-monitor.test.ts` | 경쟁가 없을 때, 조정 차단될 때 |

---

## 8. 환경변수 추가 (.env.example)

```env
# 경쟁가 모니터링
PRICE_MONITOR_ENABLED=true
PRICE_UNDERCUT_AMOUNT=10           # 경쟁사 최저가 대비 낮출 금액 (원)
PRICE_CHECK_INTERVAL_HOURS=1       # 경쟁가 체크 주기 (시간)

# 주문 폴링
ORDER_POLL_INTERVAL_MINUTES=5      # 주문 폴링 주기 (분)
```
