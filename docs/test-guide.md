# 테스트 실행 가이드

> 최종 점검일: 2026-03-04
> 전체 테스트: **60 suites / 722 tests — ALL PASS**
> 타입 체크: **8개 패키지 모두 0 errors**

---

## 1. 사전 준비

### 필수 요구사항

| 항목 | 버전 | 확인 명령어 |
|------|------|-----------|
| Node.js | 18 이상 (20 권장) | `node -v` |
| npm | 9 이상 | `npm -v` |

### 의존성 설치

```bash
# 프로젝트 루트에서 실행
npm install
```

### Prisma 클라이언트 생성

```bash
npx prisma generate --schema=packages/db/prisma/schema.prisma
```

> **참고**: 단위 테스트는 모든 외부 의존성(DB, Redis, API)을 mock으로 대체합니다.
> PostgreSQL이나 Redis가 실행 중이지 않아도 테스트 실행에 문제가 없습니다.

---

## 2. 빠른 전체 테스트 실행

```bash
# 모노레포 전체 테스트 (Turbo 병렬 실행)
npm test
```

이 명령은 `turbo run test`를 실행하여 모든 패키지/앱의 테스트를 병렬로 실행합니다.

---

## 3. 패키지별 개별 테스트

각 패키지 디렉토리에서 독립적으로 실행할 수 있습니다.

### packages/shared (공유 유틸리티)

```bash
cd packages/shared && npx jest
```

| 항목 | 내용 |
|------|------|
| suites | 3개 |
| tests | 24개 |
| 테스트 대상 | 설정 로더, 서킷브레이커, 프리플라이트 체크 |

### packages/core (비즈니스 핵심 로직)

```bash
cd packages/core && npx jest
```

| 항목 | 내용 |
|------|------|
| suites | 24개 |
| tests | 368개 |
| 테스트 대상 | 가격 계산, 마진 안전장치, 암호화, 콘텐츠 생성, 재고 관리, 주문 승인, 전략 |

### packages/crawlers (크롤러)

```bash
cd packages/crawlers && npx jest
```

| 항목 | 내용 |
|------|------|
| suites | 4개 |
| tests | 39개 |
| 테스트 대상 | BaseCrawler(robots.txt), 도매꾹, 오너클랜, 네이버쇼핑 크롤러 |

### packages/integrations (외부 API 연동)

```bash
cd packages/integrations && npx jest
```

| 항목 | 내용 |
|------|------|
| suites | 1개 |
| tests | 13개 |
| 테스트 대상 | 환율 API (캐싱, 에러 핸들링) |

### packages/adapters (어댑터)

```bash
cd packages/adapters && npx jest
```

| 항목 | 내용 |
|------|------|
| suites | 1개 |
| tests | 12개 |
| 테스트 대상 | Telegram 봇 커맨드 핸들러 (/status, /report, /pause, /resume) |

### apps/api-server (REST API)

```bash
cd apps/api-server && npx jest
```

| 항목 | 내용 |
|------|------|
| suites | 11개 |
| tests | 125개 |
| 테스트 대상 | 상품, 주문, 모니터링, 자격증명, 웹훅, Rate Limit, 스키마 검증 |

### apps/worker (BullMQ 워커)

```bash
cd apps/worker && npx jest
```

| 항목 | 내용 |
|------|------|
| suites | 16개 |
| tests | 141개 |
| 테스트 대상 | 12개 워커 잡, 이미지 파이프라인, Kill Switch, 경쟁사 제한, 설정 캐시 |

---

## 4. 타입 체크

### 전체 타입 체크 (패키지별 순차)

```bash
# 의존성 순서대로 실행
cd packages/shared && npx tsc --noEmit
cd packages/db && npx tsc --noEmit
cd packages/adapters && npx tsc --noEmit
cd packages/integrations && npx tsc --noEmit
cd packages/crawlers && npx tsc --noEmit
cd packages/core && npx tsc --noEmit
cd apps/api-server && npx tsc --noEmit
cd apps/worker && npx tsc --noEmit
```

### 특정 패키지만 체크

```bash
# 예: core 패키지만
cd packages/core && npx tsc --noEmit
```

> 출력이 없으면 0 errors (성공).

---

## 5. 테스트 커버리지

### 핵심 패키지 커버리지 실행

```bash
# Core (비즈니스 로직 핵심)
cd packages/core && npx jest --coverage

# Worker (자동화 워커)
cd apps/worker && npx jest --coverage

# API Server (REST API)
cd apps/api-server && npx jest --coverage
```

### 커버리지 리포트 열기

```bash
# 실행 후 coverage/lcov-report/index.html 파일을 브라우저에서 열기
start coverage/lcov-report/index.html    # Windows
open coverage/lcov-report/index.html     # macOS
xdg-open coverage/lcov-report/index.html # Linux
```

### 현재 커버리지 현황 (2026-03-04)

#### packages/core

| 지표 | 커버리지 |
|------|---------|
| Statements | 96.77% |
| Branches | 85.78% |
| Functions | 96.55% |
| Lines | 96.70% |

주요 파일별:

| 파일 | Stmts | Branch | 비고 |
|------|-------|--------|------|
| pricing/wholesale.ts | 82.6% | 0% | 구매대행 전용 분기 미테스트 |
| safety/guards.ts | 78.9% | 33.3% | 일부 안전장치 분기 미커버 |
| credentials/credential-service.ts | 82.2% | 57.1% | 복호화 경로 일부 미커버 |
| (나머지 30개 파일) | 97%+ | 80%+ | 양호 |

#### apps/worker

| 지표 | 커버리지 |
|------|---------|
| Statements | 79.61% |
| Branches | 59.92% |
| Functions | 70.37% |
| Lines | 80.46% |

주요 파일별:

| 파일 | Stmts | Branch | 비고 |
|------|-------|--------|------|
| refund.job.ts | 30.7% | 12.5% | 환불 처리 분기 대부분 미커버 |
| order.job.ts | 55.9% | 44% | 주문 매핑/발주 경로 미커버 |
| registration.job.ts | 71.3% | 46.9% | 등록 워크플로우 일부 미커버 |
| content.job.ts | 83.7% | 63.6% | 콘텐츠 생성 enqueue 미커버 |
| (나머지 12개 파일) | 94%+ | 77%+ | 양호 |

#### apps/api-server

| 지표 | 커버리지 |
|------|---------|
| Statements | 81.38% |
| Branches | 75.35% |
| Functions | 81.15% |
| Lines | 81.75% |

주요 파일별:

| 파일 | Stmts | Branch | 비고 |
|------|-------|--------|------|
| orders.ts | 57.3% | 63.9% | 주문 승인/거절 라우트 미커버 |
| credential-tester.ts | 69.6% | 50% | 일부 서비스 테스터 미커버 |
| (나머지 6개 파일) | 83%+ | 71%+ | 양호 |

---

## 6. 특정 테스트만 실행

### 파일 지정

```bash
# 특정 테스트 파일만 실행
cd packages/core && npx jest src/pricing/wholesale.test.ts
```

### 패턴 매칭 (테스트 이름)

```bash
# 테스트 이름에 "마진" 포함된 테스트만 실행
cd packages/core && npx jest --testNamePattern="마진"
```

### 감시 모드 (Watch)

```bash
# 파일 변경 시 자동 재실행 (개발 중 사용)
cd packages/core && npx jest --watch
```

### 특정 디렉토리만

```bash
# pricing 관련 테스트만
cd packages/core && npx jest src/pricing/
```

---

## 7. 현재 테스트 현황 총괄표

| 패키지 | suites | tests | Stmts% | Branch% | 상태 |
|--------|--------|-------|--------|---------|------|
| packages/shared | 3 | 24 | - | - | PASS |
| packages/core | 24 | 368 | 96.8% | 85.8% | PASS |
| packages/crawlers | 4 | 39 | - | - | PASS |
| packages/integrations | 1 | 13 | - | - | PASS |
| packages/adapters | 1 | 12 | - | - | PASS |
| apps/api-server | 11 | 125 | 81.4% | 75.4% | PASS |
| apps/worker | 16 | 141 | 79.6% | 59.9% | PASS |
| **합계** | **60** | **722** | - | - | **ALL PASS** |

> 마지막 전체 점검: 2026-03-04
> 타입 체크: 8개 패키지 모두 0 errors

---

## 8. 트러블슈팅

### "Cannot find module '@smartstore/...'"

```bash
# 원인: 패키지 dist 파일이 없거나 오래됨
# 해결: 해당 패키지 빌드
cd packages/shared && npx tsc --outDir dist --declaration
cd packages/core && npx tsc --outDir dist --declaration
```

### "Cannot read properties of undefined (reading 'adapter')"

```bash
# 원인: 테스트에서 @smartstore/shared의 config mock에 notification 설정 누락
# 해결: jest.mock('@smartstore/shared') 에 아래 추가
config: {
  notification: { adapter: 'telegram', telegram: { botToken: 'test', chatId: '0' } },
  # ... 기존 설정
}
```

### "Jest encountered an unexpected token" (TypeScript 구문 에러)

```bash
# 원인: Jest가 ts-jest 없이 TypeScript 파일을 파싱 시도
# 해결: package.json에 Jest 설정 추가
"jest": {
  "preset": "ts-jest",
  "testEnvironment": "node",
  "transform": {
    "^.+\\.ts$": ["ts-jest", { "isolatedModules": true }]
  }
}
```

### "worker process has failed to exit gracefully"

```bash
# 원인: 비동기 작업(타이머, 이벤트 리스너)이 정리되지 않음
# 해결: --forceExit 플래그 추가 (임시) 또는 afterAll에서 정리
cd apps/worker && npx jest --forceExit
```

### Prisma 클라이언트 오류

```bash
# 원인: Prisma 클라이언트가 생성되지 않음
# 해결:
npx prisma generate --schema=packages/db/prisma/schema.prisma
```

### 테스트에서 환경변수 관련 오류

```bash
# 테스트는 mock으로 동작하므로 .env 파일이 불필요합니다.
# 단, 일부 테스트(env-guard.test.ts)는 process.env를 직접 조작합니다.
# CI 환경에서는 별도 .env 설정 없이 실행 가능합니다.
```

---

## 부록: CI/CD 테스트 파이프라인

GitHub Actions에서 자동으로 실행되는 테스트:

```yaml
# .github/workflows/ci.yml
# Node.js 18, 20에서 병렬 테스트
steps:
  - npm ci
  - npx prisma generate
  - npx turbo run test
  - npx prettier --check '**/*.ts'
  - npx eslint '**/*.ts' --max-warnings 50
```

로컬에서 CI와 동일한 환경을 재현하려면:

```bash
npm ci
npx prisma generate --schema=packages/db/prisma/schema.prisma
npm test
```
