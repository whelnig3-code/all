# 테스트 모드 전체 점검 — 완료

> 상태: **완료** | 날짜: 2026-03-04

## 점검 결과

### 타입 체크: 8/8 패키지 0 errors

### 테스트: 60 suites / 722 tests ALL PASS

| 패키지 | suites | tests | Stmts% | Branch% |
|--------|--------|-------|--------|---------|
| packages/shared | 3 | 24 | - | - |
| packages/core | 24 | 368 | 96.8% | 85.8% |
| packages/crawlers | 4 | 39 | - | - |
| packages/integrations | 1 | 13 | - | - |
| packages/adapters | 1 | 12 | - | - |
| apps/api-server | 11 | 125 | 81.4% | 75.4% |
| apps/worker | 16 | 141 | 79.6% | 59.9% |

### 수정 항목

| # | 이슈 | 수정 내용 |
|---|------|---------|
| 1 | adapters Jest 설정 누락 | ts-jest 설정 추가 → 12 tests PASS |
| 2 | orders.test.ts config mock 불완전 | notification 설정 추가 → 15 tests PASS |

### 산출물

- `docs/test-guide.md` — 단계별 테스트 실행 설명서

---

## 이전 계획

<details>
<summary>2026-03-04: Phase 4.9 프로덕션 강화 (완료)</summary>

| # | 이슈 | 심각도 | 수정 내용 |
|---|------|--------|---------|
| 1 | uniqueKey 포맷 불일치 | HIGH | API 서버 콜론 구분자 통일 |
| 2 | Redis 연결 12개 파일 중복 | MEDIUM | `redisConnection` export + 12개 워커 공유 |
| 3 | setInterval → node-cron | MEDIUM | 5개 스케줄러 cron 표현식 전환 |
| 4 | 알림 타입 오용 | LOW | `order_received` → `product_registered` |
| 5 | CLAUDE.md 로드맵 동기화 | LOW | Phase 3/4 체크박스 갱신 |
| 6 | analysis_report.md 갱신 | LOW | 구현율 82% → 95% |

</details>

## 이전 계획 (Phase 4.5 이전)

<details>
<summary>2026-03-04: Phase 4.5 주문 승인 모드 (구현 완료)</summary>

# Phase 4.5: 주문 승인 모드 (Human Approval) — 최종 확정 계획

> 상태: **완료** | 날짜: 2026-03-04

## 요구사항 재정리

비유: 무인 편의점을 "점원 확인 편의점"으로 전환. 주문마다 텔레그램으로 [승인/거부] 버튼이 오고, 운영자가 터치해야 돈이 나간다. Kill Switch 하나로 다시 무인 모드로 전환 가능.

### 최종 흐름

```
주문 감지 → reserveStock(reservedUntil=now+5min)
         → createApproval(approvalToken 생성)
         → 텔레그램 인라인 버튼 전송 (approve_{orderId}_{token})

운영자 [승인] → 토큰 검증 → confirmStockDeduction → placeSupplierOrder → log supplierOrderId
운영자 [거부] → 토큰 검증 → releaseStock → Order 취소
5분 미응답   → reservedUntil 만료 → releaseStock → 자동 취소 + 알림
```

### 상수

```
SAFE_STOCK = 2
APPROVAL_TIMEOUT = 5 min
ORDER_APPROVAL_MODE = true  (false면 기존 자동 모드)
```

### 3가지 안전 개선사항 (유저 요구)

1. **Approval Token** — `approvalToken` (crypto.randomUUID) 으로 콜백 위조/리플레이 방지
2. **Reservation TTL** — `reservedUntil: DateTime` 으로 워커 크래시 시 영구 잠금 방지
3. **Supplier Order Logging** — `ApprovalEvent.supplierOrderId` 로 발주 추적

### 구현 규칙 (절대)

- 모든 승인 전이(approve/reject/timeout)는 **Prisma $transaction** 내에서 실행
- status=**pending** 검증 후에만 approve/reject 가능
- BullMQ delayed job은 실행 시점에 **status 재확인**
- listing pause/resume **멱등성** 유지

---

## Phase 1: DB 스키마

### 1-A. OrderApproval 모델

**파일**: `packages/db/prisma/schema.prisma`

```prisma
model OrderApproval {
  id                String    @id @default(cuid())
  orderId           String    @unique
  order             Order     @relation(fields: [orderId], references: [id])

  status            String    @default("pending")  // 'pending' | 'approved' | 'rejected' | 'timeout'
  approvalToken     String    @unique              // crypto.randomUUID — 콜백 위조 방지
  telegramMessageId Int?                           // 버튼 메시지 ID (편집용)

  decidedBy         String?                        // 'operator' | 'system_timeout'
  decidedAt         DateTime?
  rejectReason      String?

  marginRate        Float?                         // 승인 시점 스냅샷
  supplierStock     Int?                           // 승인 시점 스냅샷

  createdAt         DateTime  @default(now())
  expiresAt         DateTime                       // now + APPROVAL_TIMEOUT

  @@index([status])
  @@index([expiresAt])
  @@map("order_approvals")
}
```

### 1-B. ApprovalEvent 모델

```prisma
model ApprovalEvent {
  id              String    @id @default(cuid())
  orderId         String
  order           Order     @relation(fields: [orderId], references: [id])

  action          String    // 'created' | 'approved' | 'rejected' | 'timeout' | 'supplier_ordered'
  supplierOrderId String?   // 공급처 발주 ID (승인 후 발주 성공 시)
  metadata        Json?     // 추가 데이터

  createdAt       DateTime  @default(now())

  @@index([orderId])
  @@index([action])
  @@map("approval_events")
}
```

### 1-C. Order 관계 추가 + reservedUntil

```prisma
model Order {
  // 기존 필드 유지 + 추가
  approval        OrderApproval?
  approvalEvents  ApprovalEvent[]
}
```

### 1-D. Product reservedUntil 추가

```prisma
model Product {
  // 기존 재고 필드에 추가
  reservedUntil   DateTime?   // 예약 만료 시각 (null이면 영구 예약 없음)
}
```

**변경 파일**: 1개
**복잡도**: LOW

---

## Phase 2: 타입/상수/큐

### 2-A. 승인 상수

**파일** (신규): `packages/core/src/approval/constants.ts`

```typescript
export const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000  // 5분
```

### 2-B. 타입 추가

**파일**: `packages/shared/src/types.ts`

```typescript
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timeout'

export type ApprovalAction =
  | 'created'
  | 'approved'
  | 'rejected'
  | 'timeout'
  | 'supplier_ordered'

// NotificationType에 추가
| 'order_approval_request'
| 'order_approved'
| 'order_rejected'
| 'order_approval_timeout'
```

### 2-C. 큐 추가

**파일**: `apps/worker/src/queues.ts`

```typescript
export const orderApprovalQueue = new Queue('order-approval', defaultQueueOptions)

QUEUE_NAMES.ORDER_APPROVAL = 'order-approval'

export interface OrderApprovalJobData {
  orderId: string
  approvalToken: string
  action: 'check_timeout'
}
```

### 2-D. config 추가

**파일**: `packages/shared/src/config.ts`

```typescript
approval: {
  timeoutMs: parseInt(optionalEnv('APPROVAL_TIMEOUT_MS', '300000'), 10),
},
```

**변경 파일**: 4개
**복잡도**: LOW

---

## Phase 3: 텔레그램 인라인 키보드 + callback_query ⚠️ HIGH

### 3-A. TelegramUpdate 인터페이스 확장

**파일**: `packages/adapters/src/notification/bot-handler.ts`

```typescript
interface TelegramCallbackQuery {
  id: string
  from: { id: number }
  message?: { chat: { id: number }; message_id: number }
  data?: string  // "approve_{orderId}_{token}" | "reject_{orderId}_{token}"
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery  // 신규
}
```

### 3-B. sendMessageWithButtons()

```typescript
export async function sendMessageWithButtons(
  chatId: string | number,
  text: string,
  buttons: Array<Array<{ text: string; callback_data: string }>>
): Promise<number | null>
// reply_markup: { inline_keyboard: buttons }
// 반환값: message_id (편집용)
```

### 3-C. editMessageText()

```typescript
export async function editMessageText(
  chatId: string | number,
  messageId: number,
  text: string
): Promise<void>
```

### 3-D. answerCallbackQuery()

```typescript
async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>
// 텔레그램 로딩 스피너 해제용
```

### 3-E. startBotPolling() 수정

```typescript
// 기존 텍스트 처리 유지
if (update.message?.text) { ... }

// 신규: 콜백 처리
if (update.callback_query?.data) {
  await handleApprovalCallback(update.callback_query)
}
```

### 3-F. handleApprovalCallback()

```typescript
async function handleApprovalCallback(query: TelegramCallbackQuery): Promise<void> {
  // 1. chat_id 보안 확인
  // 2. callback_data 파싱: "approve_{orderId}_{token}" or "reject_{orderId}_{token}"
  // 3. answerCallbackQuery(query.id)
  // 4. Admin API 호출: POST /orders/{orderId}/approve or /reject
  //    Header: Authorization + X-Approval-Token: {token}
}
```

**변경 파일**: 1개
**복잡도**: **HIGH**

---

## Phase 4: 승인 서비스 (핵심) ⚠️ HIGH

### 4-A. approval.service.ts (신규)

**파일**: `packages/core/src/approval/approval.service.ts`

```typescript
/**
 * 승인 요청 생성
 * Prisma $transaction:
 *   1. 안전 검증 (margin >= 15%, stock > SAFE_STOCK) — 실패 시 자동 거부
 *   2. reserveStock(productId, qty) + reservedUntil 설정
 *   3. approvalToken = crypto.randomUUID()
 *   4. OrderApproval 생성 (status=pending, expiresAt=now+5min)
 *   5. ApprovalEvent 기록 (action=created)
 *   6. 텔레그램 인라인 키보드 전송
 *   7. telegramMessageId 저장
 *   8. BullMQ delayed job 스케줄 (5분 후 check_timeout)
 */
export async function createApprovalRequest(orderId: string): Promise<Result<void>>

/**
 * 승인 처리
 * Prisma $transaction:
 *   1. approvalToken 검증
 *   2. status=pending 확인 (이미 처리됨이면 멱등 반환)
 *   3. OrderApproval → approved
 *   4. confirmStockDeduction(productId, qty)
 *   5. Product.reservedUntil → null
 *   6. Order.status → 'preparing'
 *   7. ApprovalEvent (action=approved)
 *   8. 텔레그램 메시지 편집 (버튼 제거 + "✅ 승인됨")
 */
export async function approveOrder(orderId: string, token: string): Promise<Result<void>>

/**
 * 거부 처리
 * Prisma $transaction:
 *   1. approvalToken 검증
 *   2. status=pending 확인
 *   3. OrderApproval → rejected
 *   4. releaseStock(productId, qty)
 *   5. Product.reservedUntil → null
 *   6. Order.status → 'cancelled'
 *   7. ApprovalEvent (action=rejected)
 *   8. 텔레그램 메시지 편집 (버튼 제거 + "❌ 거부됨")
 */
export async function rejectOrder(orderId: string, token: string, reason?: string): Promise<Result<void>>

/**
 * 타임아웃 처리
 * (BullMQ delayed job에서 호출)
 *   1. status=pending 확인 (이미 처리됨이면 무시)
 *   2. OrderApproval → timeout
 *   3. releaseStock(productId, qty)
 *   4. Product.reservedUntil → null
 *   5. Order.status → 'cancelled'
 *   6. ApprovalEvent (action=timeout)
 *   7. 텔레그램 메시지 편집 + 타임아웃 알림
 */
export async function handleApprovalTimeout(orderId: string): Promise<Result<void>>
```

### 4-B. 승인 메시지 포맷

```
🔔 <b>주문 승인 요청</b>

📦 상품: USB 케이블 1m
💰 판매가: ₩19,240
🏭 도매가: ₩12,500
📊 마진: 30.2% (₩5,810)
📦 재고: 15개
👤 고객: 홍길동 / 1개

⏰ 5분 내 응답 필요

[✅ 승인]  [❌ 거부]
```

### 4-C. Reservation TTL 정리 (만료 예약 자동 해제)

```typescript
/**
 * 만료된 예약 정리 (크래시 복구용)
 * reservedUntil < now인 상품의 reservedStock을 0으로 리셋
 * 스케줄러에서 1분마다 호출
 */
export async function cleanExpiredReservations(): Promise<number>
```

**변경 파일**: 3개 (service + constants + index)
**복잡도**: **HIGH**

---

## Phase 5: 주문 흐름 분기

### 5-A. order.job.ts 수정

**파일**: `apps/worker/src/jobs/order.job.ts`

```typescript
// 주문 DB 저장 후...
const order = await prisma.order.create({ ... })

// 승인 모드 분기
if (getSetting('ORDER_APPROVAL_MODE') === 'true') {
  await createApprovalRequest(order.id)
  return { orderId: order.id, status: 'pending_approval' }
}

// 기존 자동 모드 (변경 없음)
await notificationAdapter.send({ type: 'order_received', ... })
```

**변경 파일**: 1개
**복잡도**: MEDIUM

---

## Phase 6: 타임아웃 워커

### 6-A. order-approval.job.ts (신규)

**파일**: `apps/worker/src/jobs/order-approval.job.ts`

```typescript
// BullMQ delayed job: 5분 후 실행
// 실행 시점에 status 재확인 — pending이면 타임아웃, 아니면 무시

export function createOrderApprovalWorker(): Worker {
  return new Worker<OrderApprovalJobData>(
    QUEUE_NAMES.ORDER_APPROVAL,
    async (job) => {
      if (job.data.action === 'check_timeout') {
        await handleApprovalTimeout(job.data.orderId)
      }
    },
    { connection: redisConfig, concurrency: 5 }
  )
}
```

**변경 파일**: 1개
**복잡도**: LOW

---

## Phase 7: API 엔드포인트 + 봇 연결

### 7-A. orders.ts 라우트 추가

**파일**: `apps/api-server/src/routes/orders.ts` (수정)

```
POST /orders/:orderId/approve  — Header: X-Approval-Token
POST /orders/:orderId/reject   — Header: X-Approval-Token, Body: { reason? }
```

### 7-B. bot-handler.ts 콜백 → API 호출

```typescript
// handleApprovalCallback에서:
// "approve_{orderId}_{token}" 파싱
// POST /orders/{orderId}/approve, Header: X-Approval-Token: {token}
```

**변경 파일**: 2개
**복잡도**: MEDIUM

---

## Phase 8: 워커 등록 + 봇 커맨드

### 8-A. worker/index.ts 수정

- `createOrderApprovalWorker()` 등록
- `cleanExpiredReservations()` 1분 스케줄러

### 8-B. /pending 봇 커맨드

```
/pending — 대기 중 승인 요청 목록
```

### 8-C. 텔레그램 이모지 매핑

```typescript
order_approval_request: '🔔',
order_approved: '✅',
order_rejected: '❌',
order_approval_timeout: '⏰',
```

**변경 파일**: 3개
**복잡도**: LOW

---

## 구현 순서

```
Phase 1 (스키마) → Phase 2 (타입/큐) → Phase 3 (텔레그램 버튼)
                                              ↓
                                        Phase 4 (승인 서비스)
                                              ↓
                                   Phase 5 (주문 분기) + Phase 6 (타임아웃)
                                              ↓
                                        Phase 7 (API + 콜백)
                                              ↓
                                        Phase 8 (워커 + 봇)
```

### 요약

| Phase | 내용 | 파일 수 | 복잡도 |
|-------|------|---------|--------|
| 1 | DB — OrderApproval + ApprovalEvent + reservedUntil | 1 | LOW |
| 2 | 타입/상수/큐/config | 4 | LOW |
| 3 | 텔레그램 인라인 키보드 + callback_query | 1 | **HIGH** |
| 4 | 승인 서비스 (create/approve/reject/timeout/cleanExpired) | 3 | **HIGH** |
| 5 | 주문 흐름 분기 (ORDER_APPROVAL_MODE) | 1 | MEDIUM |
| 6 | 타임아웃 워커 (BullMQ delayed) | 1 | LOW |
| 7 | API + 봇 콜백 연결 | 2 | MEDIUM |
| 8 | 워커 등록 + /pending + 이모지 | 3 | LOW |

**총: 16개 파일 (신규 6, 수정 10)**

---

## 리스크

| 리스크 | 심각도 | 대응 |
|--------|--------|------|
| 콜백 위조/리플레이 | **HIGH** | approvalToken 검증 (UUID, 1회용) |
| 워커 크래시 → 영구 잠금 | **HIGH** | reservedUntil TTL + 1분 정리 스케줄러 |
| 중복 승인 (더블클릭) | **HIGH** | Prisma 트랜잭션 + status=pending 체크 |
| 타임아웃 vs 실제 승인 경합 | MEDIUM | status 재확인 → 이미 처리면 무시 |
| 봇 polling 중단 | MEDIUM | 타임아웃 안전망 + polling 자동 재시작 |

---

## 검증 기준 (TDD)

- [ ] `createApprovalRequest()` — token 생성 + reservedUntil 설정 + 텔레그램 전송 + delayed job
- [ ] `approveOrder()` — 토큰 검증 + status=pending 확인 + confirmStockDeduction + supplierOrderId 로깅
- [ ] `rejectOrder()` — 토큰 검증 + releaseStock + 메시지 편집
- [ ] `handleApprovalTimeout()` — status=pending만 처리, approved면 무시
- [ ] `cleanExpiredReservations()` — reservedUntil < now인 상품 자동 해제
- [ ] 잘못된 토큰 → 거부
- [ ] 이미 처리된 주문 재승인 → 멱등 (에러 없이 무시)
- [ ] margin < 15% → 자동 거부 + 알림
- [ ] stock <= SAFE_STOCK → 자동 거부 + 알림
- [ ] ORDER_APPROVAL_MODE=false → 기존 자동 흐름 유지 (회귀 없음)
- [ ] callback_query 보안: 허용된 chat_id만 처리

---

## 이전 계획

<details>
<summary>2026-03-04: 재고 관리 시스템 (구현 완료)</summary>

> 상태: 구현 완료 (41 테스트, 100% 커버리지)
> Phase 1~10: DB 스키마 + 캐시/예약/판매중지 서비스 + 폴링 워커 + API

</details>

<details>
<summary>이전 계획 (모두 완료)</summary>

- 시작 시스템 전면 개편 — PowerShell 런처
- 전체 보강/개선 Phase A~F — 550 테스트
- 대시보드/사업자모드/런처UX/대시보드리뉴얼

</details>

</details>
