# JM Agent Team 대시보드 — 종합 고도화 로드맵

## Context

코드베이스 전수 탐사 결과: 프론트엔드 65%, 백엔드 C+, 인프라 70/100.
골조(라우팅 엔진, SSE 스트리밍, WebSocket 실시간)는 탄탄하나, 마감재(입력 검증, 테스트, DB, 로깅)가 빠진 상태.
비유: 엔진은 강력한데 브레이크와 계기판이 없는 자동차.

### 핵심 발견

- **파일 크기 초과**: agent-manager.ts(1,195줄), agent-router.ts(1,131줄), ChatArea.tsx(1,255줄)
- **입력 검증 부재**: 13개 API 라우트에 zod 스키마 0개
- **상태 비대화**: page.tsx에 useState 18개 집중
- **데이터 영속성 취약**: 파일 기반 JSON, 에이전트 통계 서버 재시작 시 소멸
- **테스트 부재**: 스모크 테스트 1개만 존재

---

## Phase 1: Quick Wins (1-2주) ← 현재 진행 중

### 1-1. zod 입력 검증 (모든 API 라우트) — 즉시
### 1-2. Prettier + ESLint + pre-commit hooks — 즉시
### 1-3. 에러 핸들링 통일 — 즉시
### 1-4. 로딩 스켈레톤 UI — 1주 후
### 1-5. temp 파일 자동 정리 — 즉시
### 1-6. ErrorBoundary 적용 확대 — 1주 후

## Phase 2: Core Improvements (3-6주)

### 2-1. 테스트 프레임워크 (Vitest + RTL)
### 2-2. page.tsx 상태 관리 리팩토링
### 2-3. 구조적 로깅 (pino)
### 2-4. 대형 파일 분리
### 2-5. 대화 검색/필터
### 2-6. 대화 내보내기 (Markdown)

## Phase 3: Advanced Features (2-3개월)

### 3-1. PostgreSQL 마이그레이션 (Prisma)
### 3-2. 에이전트 병렬 실행
### 3-3. 멀티홉 실행 (Shadow → 실제)
### 3-4. 워크플로우 실행 엔진
### 3-5. Redis 캐싱
### 3-6. Docker + docker-compose
### 3-7. CI/CD (GitHub Actions)
### 3-8. 토큰 사용량 대시보드
### 3-9. E2E 테스트 (Playwright)
### 3-10. API 문서 자동 생성

## Phase 4: Future Vision (3-6개월)

### ✅ 4-2. 멀티 테넌시 (완료)
- 테넌트 레지스트리 + API 키 인증
- 테넌트별 데이터 디렉터리 격리 (`docs/{tenantId}/`)
- 모든 API 라우트 테넌트 컨텍스트 주입
- 프론트엔드 멀티 테넌트 로그인 (관리자/API 키 탭)
- Rate limiting 테넌트 연동
- 252 테스트, 빌드 성공

### ✅ 4-9. Rate Limiting (완료)
- Sliding window rate limiter
- 엔드포인트별 프리셋 (chat: 10/분, api: 60/분, auth: 5/분)
- 테넌트 인식 키 생성

### ✅ 코드 품질 개선 (완료)
- [R-01] agent-router 내부 selectedAgent 일관 사용
- [R-06] agentActiveMap/agentStatusMap → agentStateMap 통합
- [R-08] 비용 프로필 agent-profiles.ts로 단일화

### ✅ Tier 1 UX (완료)
- 다크/라이트 테마 전환
- 메시지 편집/삭제
- ROUTING_RULES 추가/편집 UI

### ✅ Tier 2 Core (완료, 298 테스트)
- 2-1 RTL 컴포넌트 테스트 34개
- 2-2 page.tsx useState → useReducer (3개 리듀서)
- 2-4 agent-router.ts 파일 분리 (5개 모듈)

### 🔧 Tier 3 (진행 중)
- 3A: 보안 강화 (path traversal, UUID 검증, CORS)
- 3B: 인프라 (atomic write, AbortController)
- 3C: 워크플로우 자동 실행

### 미구현
- 4-1. 커스텀 에이전트 생성 UI
- 4-4. 모바일/태블릿 반응형
- 4-5. 코드 에디터 신택스 하이라이팅
- 4-6. 에이전트 실행 로그 패널 강화
- 4-8. 파일 업로드 (채팅 첨부)

---

전체 상세 로드맵: `.claude/plans/shiny-pondering-dragon.md` 참조
