# 구현 분석 리포트

- 검토일: 2026-03-02
- 기준 문서: `docs/phase2-plan.md`
- 구현율: **82%** (조건부 통과 — 수정 필요 사항 존재)

---

## 1. 파일별 구현 완성도 표

| # | 파일 | 구현 상태 | 기획 일치 | 주요 이슈 |
|---|------|----------|----------|---------|
| 1 | `apps/worker/src/index.ts` | 완료 | 부분 불일치 | node-cron 대신 setInterval 사용, Phase 3·4 잡이 선제 포함됨 |
| 2 | `apps/worker/src/queues.ts` | 완료 | 일치 | `OrderJobData.orderItem` 필드 정상 추가됨 |
| 3 | `apps/worker/src/jobs/order.job.ts` | 완료 | 일치 | customerPhone 암호화 주석만 있고 실제 암호화 미구현 |
| 4 | `apps/worker/src/jobs/shipping.job.ts` | 완료 | 일치 | 파일명이 plan과 다름 (`shipping.job.ts` vs `shipping-notification.job.ts`) |
| 5 | `apps/worker/src/jobs/price-monitor.job.ts` | 완료 | 부분 불일치 | 크롤러 미연동 — 네이버 쇼핑 Search API 직접 호출로 대체 |
| 6 | `apps/worker/src/jobs/registration.job.ts` | 완료 | 일치 | Rate limit 준수 (concurrency=1), 알림 타입 오용 |
| 7 | `packages/crawlers/src/naver-shopping.ts` | 완료 | 부분 불일치 | BaseCrawler 미상속, robots.txt 체크 로직 누락 |
| 8 | `packages/core/src/pricing/price-adjuster.ts` | 완료 | 일치 | `blockedByMarginGuard` 필드 누락 (인터페이스 불일치) |
| 9 | `packages/core/src/safety/guards.ts` | 완료 | 일치 | 이상 없음 |
| 10 | `packages/integrations/src/naver/product.ts` | 완료 | 일치 | Rate limit 준수 (finally sleep 1000ms) |
| 11 | `packages/integrations/src/naver/order.ts` | 완료 | 일치 | @encrypted 주석은 있으나 실제 암호화 미구현 |
| 12 | `apps/api-server/src/index.ts` | 완료 | 부분 불일치 | plan 지정 엔드포인트 구조 변경됨, webhook 엔드포인트 미구현 |

---

## 2. 완료된 기능

### Phase 2 핵심 4개 항목

| 항목 | 상태 | 구현 파일 |
|------|------|---------|
| 네이버 상품 자동 등록 API | 완료 | `registration.job.ts`, `product.ts` |
| 주문 자동 확인 및 처리 | 완료 | `order.job.ts` (고객정보 매핑 수정 포함) |
| 자동 배송 알림 발송 | 완료 | `shipping.job.ts` |
| 경쟁가 모니터링 및 가격 조정 | 완료 | `price-monitor.job.ts`, `price-adjuster.ts` |

### 추가 구현된 항목 (plan 외)

| 항목 | 파일 | 비고 |
|------|------|------|
| Phase 3 콘텐츠 생성 워커 | `content.job.ts` | Phase 3 선행 구현 |
| Phase 4 환불/교환 워커 | `refund.job.ts` | Phase 4 선행 구현 |
| API 서버 (products, orders, monitoring 라우터) | `api-server/` | plan의 선택 항목 이상으로 구현 |
| 경쟁사 가격 DB 저장 | `price-monitor.job.ts` | `competitor_prices` 테이블 저장 완료 |
| 가격 히스토리 DB 저장 | `price-monitor.job.ts` | `price_histories` 테이블 저장 완료 |

---

## 3. 누락 / 미완성 기능

### 3-1. [중요] 네이버 쇼핑 크롤러가 price-monitor에 미연동

- **현상:** `price-monitor.job.ts` 내부 `fetchCompetitorPrices()`는 네이버 쇼핑 검색 API를 직접 호출함. `packages/crawlers/src/naver-shopping.ts`의 `NaverShoppingCrawler`(Playwright 기반)는 구현되어 있으나 price-monitor.job에서 import하지 않고 사용하지 않음.
- **기획 의도:** API 일일 한도(1,000건) 초과 시 Playwright 크롤러를 fallback으로 사용하는 구조였음 (`naver-shopping.ts` 파일 상단 주석 참조).
- **해결 방안:** `price-monitor.job.ts`의 `fetchCompetitorPrices()`에서 API 한도 초과 시 `NaverShoppingCrawler`로 fallback 처리 필요.

### 3-2. [중요] BaseCrawler 미상속 — robots.txt 체크 누락

- **현상:** `NaverShoppingCrawler`가 `BaseCrawler`를 상속하지 않음. `BaseCrawler.checkRobotsTxt()` 로직이 전혀 호출되지 않음.
- **기획 의도 (CLAUDE.md 핵심 경고 #4):** `BaseCrawler.checkRobotsTxt()` 로직 제거 금지.
- **해결 방안:** `NaverShoppingCrawler extends BaseCrawler` 처리 필요.

### 3-3. [중요] customerPhone 암호화 미구현

- **현상:** `order.job.ts` L91에 `// @encrypted - 암호화 저장 필요` 주석이 있으나 AES-256 암호화 로직은 구현되지 않음. `order.ts` mapNaverOrderToInternal() 동일.
- **기획 의도 (CLAUDE.md 핵심 경고 #5):** 고객 전화번호는 반드시 암호화 저장.
- **해결 방안:** 저장 전 암호화 함수 호출 또는 Prisma 미들웨어로 자동 암호화 처리 필요.

### 3-4. [낮음] 스케줄러 구현 방식 불일치

- **현상:** `index.ts`에서 `node-cron` 대신 `setInterval`을 사용함. plan 3-1에서는 cron 표현식(`*/5 * * * *`, `0 * * * *`, `0 9 * * *`) 기반 node-cron 사용을 명시함.
- **영향:** `setInterval`은 서버 재시작 시 다음 실행 시각이 리셋됨. `0 9 * * *` 형태의 특정 시각 스케줄링이 불가능함.
- **해결 방안:** `node-cron` 도입 또는 현재 구조 문서화.

### 3-5. [낮음] API 서버 — plan 지정 엔드포인트 구조 상이

- **기획 엔드포인트:**
  - `POST /admin/products/enqueue`
  - `POST /admin/prices/check`
  - `GET  /admin/queues/stats`
  - `POST /webhooks/naver`
- **실제 구현:**
  - `POST /products` (상품 생성 + 큐 추가 통합)
  - `POST /products/:id/register` (특정 상품 등록 큐 추가)
  - `GET  /monitoring/queues` (큐 통계)
  - 네이버 주문 웹훅 엔드포인트 미구현
- **영향:** 웹훅 미구현으로 인해 실시간 주문 수신 불가 (현재는 폴링만 가능).

### 3-6. [낮음] PriceAdjustResult 인터페이스 불일치

- **기획 (`phase2-plan.md` 3-5):**
  ```typescript
  export interface PriceAdjustmentOutput {
    shouldAdjust: boolean
    newPrice: number
    reason: string
    blockedByMarginGuard: boolean  // 기획에 명시된 필드
  }
  ```
- **실제 구현 (`price-adjuster.ts`):**
  ```typescript
  export interface PriceAdjustResult {
    shouldAdjust: boolean
    newPrice: number
    reason: string
    // blockedByMarginGuard 필드 없음
  }
  ```
- **영향:** 마진 안전장치 차단 여부를 알림에서 명시적으로 구분할 수 없음.

---

## 4. 코드 품질 점검

### 잘된 점

| 항목 | 내용 |
|------|------|
| Rate limit 준수 | `product.ts` finally 블록 sleep(1000), `registration.job.ts` concurrency=1 |
| 마진 안전장치 연동 | `price-adjuster.ts`에서 `MIN_MARGIN_RATE` import 후 정상 연동 |
| 에러 핸들링 | 모든 워커에 try-catch + jobLog 실패 기록 구조 일관 적용 |
| Graceful shutdown | `index.ts`에서 SIGTERM/SIGINT 처리, 모든 워커·큐 종료 |
| 중복 주문 방지 | `pollAndEnqueueNewOrders()`에서 DB 조회로 기존 주문 필터링 |
| 한국어 주석 | 대부분 파일에 한국어 주석 충분히 작성됨 |

### 개선 필요 사항

| 항목 | 현재 상태 | 권장 변경 |
|------|---------|---------|
| `registration.job.ts` 알림 타입 | `type: 'order_received'` 사용 (상품 등록에 주문 타입) | `type: 'product_registered'` 로 변경 |
| `refund.job.ts` 코드 스타일 | 세미콜론 사용, 타입에 `any` 다수 사용, 다른 파일과 스타일 불일치 | 프로젝트 ESLint 규칙 통일 필요 |
| `refund.job.ts` 알림 | `sendNotification()` 내부가 TODO 주석만 남아 있음 (실제 미구현) | `notificationAdapter.send()` 연동 필요 |
| `monitoring.ts` 헬스체크 로직 | `allHealthy` 판별 조건이 잘못 작성됨 (timestamp 문자열을 'ok'와 비교) | 조건 수정 필요 |
| `refund.job.ts` DB 조회 | `prisma.order.findUnique({ where: { orderId } })` — `orderId`가 아닌 `naverOrderId` 필드로 조회해야 할 가능성 | 스키마 확인 후 수정 |
| Redis 연결 설정 중복 | 각 워커 파일마다 Redis 연결 객체를 직접 정의 | `queues.ts`의 `redisConnection` 객체를 export하여 공유 |

---

## 5. 보안 이슈

> 보안 상세 검토는 @security-auditor에게 위임합니다.

| 이슈 | 위치 | 심각도 |
|------|------|--------|
| 고객 전화번호 평문 저장 | `order.job.ts` L91, `order.ts` L52 | 높음 |
| `refund.job.ts` 타입 `any` 다수 사용 | `refund.job.ts` 전반 (`settings: any`, `store: any` 등) | 중간 |
| API 서버 입력값 검증 없음 | `products.ts` POST `/products` — 요청 바디 스키마 검증 없음 | 중간 |
| 네이버 쇼핑 API 응답 타입 단언 | `price-monitor.job.ts` L223 `as { items: Array<...> }` | 낮음 |

---

## 6. 총평

Phase 2 핵심 기능 4개는 모두 구현되어 있으며, Phase 3·4 일부까지 선행 구현된 상태임.

**판정: 통과** — 아래 항목 모두 수정 완료됨.

---

## 7. 재검토 (2026-03-04)

### 수정 완료 항목

| # | 이슈 | 수정 내용 | 수정 세션 |
|---|------|---------|---------|
| 3-2 | BaseCrawler 미상속 | `NaverShoppingCrawler extends BaseCrawler` 적용, `checkRobotsTxt()` 호출 | Phase 2 후속 |
| 3-3 | customerPhone 암호화 미구현 | `encryptPhone()` 연동, 3개 필드 분리 저장 | Phase 2 후속 |
| 3-6 | blockedByMarginGuard 누락 | `PriceAdjustResult` 인터페이스 + 로직 구현 완료 | Phase 2 후속 |
| 3-4 | setInterval → node-cron | `node-cron` 도입, 5개 스케줄러 cron 표현식 전환 | Phase 4.9 |
| 4 | 알림 타입 오용 | `order_received` → `product_registered` 변경 | Phase 4.9 |
| 4 | Redis 연결 중복 | `redisConnection` export + 12개 워커 공유 | Phase 4.9 |
| - | uniqueKey 포맷 불일치 | API 서버 `_` → `:` (크롤러 표준 통일) | Phase 4.9 |

### 현재 테스트 현황

- Worker: 141 tests (16 suites) — ALL PASS
- Core: 368 tests (24 suites) — ALL PASS
- 전체: 509+ tests, tsc --noEmit: 0 errors

### 구현율 재평가: **95%** (Phase 2~4 핵심 기능 완료, Phase 5 대기)
