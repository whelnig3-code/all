# 스마트스토어 올 자동화 시스템

> CEO: 정민 | 프로젝트 시작: 2026-02-27 | 상태: 개발 중

## 프로젝트 개요

네이버 스마트스토어 위탁판매 자동화 시스템.  
**Phase 1~4**: 위탁판매(도매꾹/오너클랜) 완전 자동화  
**Phase 5+**: 구매대행(알리익스프레스/타오바오) 확장 (코드는 이미 구현됨, env로 활성화)

## 현재 Phase: Phase 2 (자동화 로직) ✅

## 폴더 구조

```
smartstore-automation/
├── packages/
│   ├── shared/          # 공유 타입, 설정, 로거
│   ├── db/              # Prisma ORM, DB 스키마
│   ├── core/            # 가격 계산 엔진, 카테고리 분류, 안전장치
│   ├── adapters/        # 무료↔유료 교체 가능한 어댑터
│   ├── crawlers/        # Playwright 크롤러
│   │   ├── domaegguk/       # 도매꾹 크롤러
│   │   ├── ownerclan/       # 오너클랜 크롤러
│   │   ├── naver-shopping/  # 네이버쇼핑 모니터
│   │   ├── aliexpress/      # 알리익스프레스 크롤러 (구매대행)
│   │   └── taobao/          # 타오바오 크롤러 (구매대행)
│   └── integrations/    # 외부 API (네이버, 톡톡, 환율)
├── apps/
│   ├── api-server/      # Fastify REST API
│   ├── worker/          # BullMQ 비동기 워커
│   └── dashboard/       # Next.js 모니터링 대시보드
└── docs/                # 프로젝트 문서
```

## 핵심 경고 ⚠️

### 1. 구매대행 비활성화 (현재)
```env
SOURCING_ALIEXPRESS_ENABLED=false
SOURCING_TAOBAO_ENABLED=false
```
위탁판매(Phase 1~4) 우선 구현. Phase 5+에서 `.env` 한 줄로 활성화 가능.

### 2. 안전장치 무시 금지
`packages/core/src/safety/guards.ts` — 마진율 15% 하한선 절대 낮추지 말 것
```typescript
const MIN_MARGIN_RATE = 0.15  // 15% 미만이면 거래 불가
```

### 3. 네이버 API Rate Limit
상품 등록은 초당 1건 이하로 제한
```typescript
// registration.job.ts
await sleep(1000)  // 최소 1초 간격 유지
```

### 4. 크롤링 준수
`BaseCrawler.checkRobotsTxt()` 로직 제거 금지
- robots.txt 확인 후 크롤링 진행
- 요청 간 2~5초 랜덤 지연 (봇 감지 회피)

### 5. 이미지 파이프라인 실패 정책
모든 단계(OCR/번역/리디자인/업로드) 실패 시 **등록 중단 금지** — 원본으로 degrade
로그 reason: `ocr_failed` | `translate_failed` | `redesign_failed` | `naver_upload_failed`
상세 스펙: `docs/image-pipeline-spec.md`

### 6. 개인정보 암호화 ✅
`orders` 테이블 `customer_phone`은 AES-256-GCM 암호화 저장됨
- 암호화: `packages/core/src/security/encryption.ts` → `encryptPhone()`
- 적용: `apps/worker/src/jobs/order.job.ts` → `customerPhoneCiphertext/Iv/AuthTag` 3개 필드 분리 저장

## 비즈니스 모델 (가격 공식)

### 위탁판매 (현재 활성)
```
판매가 = toPsychPrice((도매가 + 배송비) / (1 - 네이버수수료율 - 목표마진율))

toPsychPrice: 1,000원 올림 → -100원 = X,900원 (심리가격)
단, -100원 결과가 원래 계산가보다 낮으면 1,000원 올림 유지
```

예시:
```
도매가: 10,000원
배송비: 2,500원
네이버수수료: 5%
목표마진: 30%

rawPrice = (10,000 + 2,500) / (1 - 0.05 - 0.30)
         = 12,500 / 0.65
         = 19,230.77원
판매가 = toPsychPrice(19,230.77)
       = ceil(20,000) - 100
       = 19,900원
```

### 구매대행 (Phase 5+, 코드 준비됨)
```
판매가 = toPsychPrice(
  (해외원가 × 환율 + 해외배송비 + 관세 + 부가세 + 국내택배비)
  / (1 - 네이버수수료율 - 마진율)
)
```

예시 (알리익스프레스):
```
상품: USB 케이블
달러 가격: $2.50
달러-원화 환율: 1,200원/$

원화 원가: 2.50 × 1,200 = 3,000원
해외배송비: 1,000원 (평균)
관세: 3,000 × 10% = 300원
부가세: (3,000 + 300) × 10% = 330원
국내택배비: 3,000원

총 원가: 3,000 + 1,000 + 300 + 330 + 3,000 = 7,630원

rawPrice = 7,630 / 0.65 = 11,738.46원
판매가 = toPsychPrice(11,738.46)
       = ceil(12,000) - 100
       = 11,900원
```

## 실행 방법

### 사전 준비
```bash
# 저장소 클론 및 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
# .env 수정: API 키 입력 (네이버, 환율 API 등)

# PostgreSQL 인스턴스 시작 (Docker)
docker-compose up -d postgres

# DB 마이그레이션
npm run db:push
```

### 개발 환경 실행
```bash
# 전체 모노레포 빌드 및 실행
npm run dev

# 또는 개별 실행
npm run dev -w packages/crawlers
npm run dev -w apps/api-server
npm run dev -w apps/worker
```

### 프로덕션 배포
```bash
npm run build
npm run start
```

## 어댑터 전환 (.env 수정만으로 교체)

| 어댑터 | 무료 (기본) | 유료 전환 |
|--------|-----------|---------|
| 번역 | `TRANSLATOR_ADAPTER=google-free` | `=deepl` |
| 알림 | `NOTIFICATION_ADAPTER=telegram` | `=sms` |
| LLM | `LLM_ADAPTER=ollama` | `=openai` |
| 구매대행 소싱 | `SOURCING_ALIEXPRESS_ENABLED=false` | `=true` |
| 구매대행 소싱 | `SOURCING_TAOBAO_ENABLED=false` | `=true` |

## 작업 위임 규칙

| 상황 | 에이전트 |
|------|---------|
| 새 기능 기획 | @planner |
| 코드 구현/버그수정 | @developer |
| 코드 리뷰 | @reviewer |
| 보안 점검 | @security-auditor |
| 문서 작성 | @writer |

## 주요 기능 (구현 상태)

### Phase 1: 인프라 구축
- [x] 프로젝트 구조 및 모노레포 설정
- [x] 데이터베이스 스키마 (위탁판매 + 구매대행 필드)
- [x] 기본 크롤러 (BaseCrawler)
- [x] 위탁판매 가격 계산 엔진
- [x] 구매대행 가격 계산 엔진 (미활성화)
- [x] 도매꾹/오너클랜 크롤러
- [x] 알리익스프레스 크롤러 (비활성화)
- [x] 타오바오 크롤러 (비활성화)

### Phase 2: 자동화 로직 ✅ 완료
- [x] 네이버 상품 자동 등록 API (`packages/integrations/src/naver/product.ts`)
- [x] 주문 자동 확인 및 처리 (`apps/worker/src/jobs/order.job.ts`)
- [x] 자동 배송 알림 발송 (`apps/worker/src/jobs/shipping.job.ts`)
- [x] 경쟁가 모니터링 및 가격 조정 (`apps/worker/src/jobs/price-monitor.job.ts`)

### Phase 3: 콘텐츠 생성 ✅ 완료
- [x] **이미지 파이프라인**: OCR → 번역 → 금칙어 필터 → 이미지 리디자인 → 네이버 업로드 (`docs/image-pipeline-spec.md` 참고)
- [x] 상품 설명 자동 생성 (LLM) (`packages/core/src/content/product-description.ts`)
- [x] 네이버 블로그 게시물 자동화 (`apps/worker/src/jobs/blog-posting.job.ts`)
- [ ] 네이버 쇼츠 제작 자동화

### Phase 4: 고급 기능 ✅ 완료
- [x] 고객 톡톡 자동 응답 (`apps/worker/src/jobs/talktalk.job.ts`)
- [x] 환불/교환 자동 처리 (`apps/worker/src/jobs/refund.job.ts`)
- [x] 주문 승인 모드 — Phase 4.5 (`apps/worker/src/jobs/order-approval.job.ts`)
- [x] 재고 동기화/복구 (`apps/worker/src/jobs/inventory-sync.job.ts`, `inventory-recovery.job.ts`)
- [x] 도매 원가 변동 감지 (`apps/worker/src/jobs/wholesale-watcher.job.ts`)
- [ ] 트렌드 분석 및 상품 추천

### Phase 5+: 구매대행 확장
- [ ] 알리익스프레스 크롤러 활성화
- [ ] 타오바오/1688 크롤러 활성화
- [ ] 실시간 환율 API 통합
- [ ] 해외 배송 관리 시스템

## 환경변수 (.env)

```env
# 데이터베이스
DATABASE_URL=postgresql://user:password@localhost:5432/smartstore

# 네이버 API
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
NAVER_SHOP_ID=

# 번역 서비스
TRANSLATOR_ADAPTER=google-free
DEEPL_API_KEY=  # 유료 전환 시

# 알림 서비스
NOTIFICATION_ADAPTER=telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# LLM
LLM_ADAPTER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OPENAI_API_KEY=  # 유료 전환 시

# 구매대행 활성화 (Phase 5+)
SOURCING_ALIEXPRESS_ENABLED=false
SOURCING_TAOBAO_ENABLED=false

# 환율 API
EXCHANGE_RATE_API_KEY=

# 시스템
NODE_ENV=development
LOG_LEVEL=debug
```

## 개발 팀 규칙

### 커밋 메시지 형식
```
feat(scope): 기능 설명

- 상세 내용 1
- 상세 내용 2
```

예시:
```
feat(crawlers): 알리익스프레스 크롤러 구현

- 상품 검색 및 상세 크롤링
- 옵션 추출 (색상, 사이즈)
- 이미지 다운로드

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

### 코드 스타일
- TypeScript 타입 안정성 필수
- 한국어 주석으로 복잡한 로직 설명
- 에러 처리 필수 (try-catch 또는 Result 타입)
- 테스트 코드 필수 (Jest)

### 새 기능 추가 체크리스트
- [ ] 타입 정의 추가 (types.ts)
- [ ] 구현 파일 작성 (index.ts)
- [ ] 패키지 index에 export 추가
- [ ] 테스트 코드 작성
- [ ] README 업데이트
- [ ] 환경변수 추가 (.env.example)

## 자주 묻는 질문 (FAQ)

### Q: 구매대행 크롤러는 언제 활성화되나요?
A: Phase 5+ 에서 활성화됩니다. 현재는 코드만 구현되어 있고 `.env`에서 `SOURCING_ALIEXPRESS_ENABLED=false`로 비활성화되어 있습니다.

### Q: 마진율을 15% 미만으로 설정하고 싶은데요?
A: 불가능합니다. `packages/core/src/safety/guards.ts`에서 15% 하한선이 강제됩니다. 이는 비즈니스 손실을 방지하기 위한 필수 안전장치입니다.

### Q: 어댑터를 바꾸려면?
A: `.env` 파일의 어댑터 환경변수만 변경하면 됩니다. 코드 수정 불필요.

### Q: 크롤링 중 봇 감지되나요?
A: 요청 간 2~5초 랜덤 지연, User-Agent 변경, 로컬 쿠키 초기화 등으로 회피합니다. 그래도 차단되면 Playwright의 `headless: false`로 테스트하세요.

## 참고 자료

- [Playwright 문서](https://playwright.dev/)
- [Prisma 문서](https://www.prisma.io/docs/)
- [Fastify 문서](https://www.fastify.io/)
- [네이버 커머스 API](https://developers.naver.com/docs/serviceapi/)

## 라이선스

MIT
