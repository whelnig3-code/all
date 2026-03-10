# 스마트스토어 경쟁력 고도화 — 확정 계획

> 2026-03-10 확정 | 마케팅 에이전트 검증 완료
> 니치: 공구 소모품 & 부속 (그라인더 디스크 4인치로 시작, SKU 20개)
>
> **진행 상태**: Phase 0~C 14개 모듈 구현+테스트+와이어링 완료 (2026-03-10)
> - core: 43 suites, 608 tests ALL PASS
> - worker: 18 suites, 179 tests ALL PASS
> - 커밋 아직 안 함 — 다음 세션에서 /commit-push-pr

## 전략 원칙 (마케팅 검증 반영)

1. **1카테고리 집중**: 그라인더 디스크(4인치)로 시작, SKU 20개
2. **최소 객단가 15,000원**: 세트/묶음 판매 강제 (단품 배송비 적자 방지)
3. **리뷰 = 생존**: 10개 → 30개 → 100개 단계별 목표
4. **규격 정확성 = USP**: "규격 불일치 무료반품" 보장

## 수정된 마진 엔진

| 가격대 | 기본 최저 마진 | 부스트 모드 | 절대 최저 금액 |
|--------|-------------|-----------|-------------|
| ~15,000원 | 20% | 15% | 2,000원 |
| 15,000~30,000원 | 15% | 12% | 2,500원 |
| 30,000~100,000원 | 12% | 9% | 3,500원 |
| 100,000원+ | 10% | 8% | 8,000원 |

부스트 모드: 스토어 리뷰 50개 미만일 때 자동 활성화

---

## Phase 0: 상세페이지 차별화 엔진 (TDD) ✅ 완료

### 0-1. 가격대별 동적 마진 엔진
- **파일**: `packages/core/src/pricing/tiered-margin.ts` (NEW)
- **내용**: 가격대별 최저 마진 + 절대 금액 가드 + 부스트 모드
- **테스트**: 각 가격대 경계값, 부스트 ON/OFF, 절대 금액 가드

### 0-2. 차별점 배너 시스템
- **파일**: `packages/core/src/content/usp-banner.ts` (NEW)
- **내용**: USP 배너 HTML 생성 (규격보장, 당일출고, KC인증, 규격표)
- 부스트 모드 시 "첫 구매 혜택" + "리뷰 적립금" 배너 추가
- **테스트**: 기본 배너, 부스트 배너, 카테고리 분기

### 0-3. 카테고리별 구매 가이드 콘텐츠 맵
- **파일**: `packages/core/src/content/buying-guide-map.ts` (NEW)
- **내용**: 카테고리 키워드 → 구매 가이드 템플릿 매핑
- **테스트**: 카테고리 매칭, fallback, HTML 생성

### 0-4. 호환성 표 생성기
- **파일**: `packages/core/src/content/compatibility-table.ts` (NEW)
- **내용**: 규격 패턴 → 호환 기기 표 자동 생성
- **테스트**: 패턴 매칭, 브랜드 매핑, HTML 생성

### 0-5. 수량 가이드 + 안전 경고
- **파일**: `packages/core/src/content/quantity-guide.ts` (NEW)
- **내용**: 소모량 안내 → 세트 상품 유도 + 안전 주의사항
- **테스트**: 카테고리별 수량 계산, 안전경고 포함 여부

### 0-6. FAQ 자동 생성
- **파일**: `packages/core/src/content/faq-generator.ts` (NEW)
- **내용**: 카테고리 + 스펙 기반 사전 정의 FAQ
- **테스트**: 카테고리별 FAQ 매칭, 스펙 반영

### 0-7. buildDetailHtml 통합 리뉴얼
- **파일**: `apps/worker/src/jobs/detail-content-builder.ts` (MODIFY)
- **내용**: 새 HTML 구조
  ```
  USP 배너 → 사용영상 플레이스홀더 → 이미지 → 규격표+호환성표 →
  구매가이드 → 수량가이드 → 비교표 → FAQ → 안전경고 →
  배송/반품 → 리뷰유도 → 키워드태그 → 푸터
  ```
- **테스트**: 전체 HTML 구조, 카테고리 분기, fallback

## Phase A: 운영 안정화 ✅ 완료

### A-1. 크롤러 셀렉터 수정 + 모바일 fallback + 헬스체크 ✅
### A-2. 가격 모니터링 dry-run + 변동 한도 안전장치 ✅ (price-change-guard)
### A-3. 등록 거부 분석 ✅ (rejection-analyzer 모듈, API 엔드포인트는 미생성)

## Phase B: 성장 엔진 ✅ 완료

### B-1. 스마트 상품 선별 (니치 최적화) ✅ (niche-selector)
### B-2. 원산지 + 가격대별 통합 마진 엔진 ✅ (origin-margin + tiered-margin + guards.ts 연동)
### B-3. 리뷰 관리 시스템 — ⏳ 미구현 (review-monitor.job.ts 필요)
### B-4. 다나와 경쟁가 수집 — ⏳ 미구현

## Phase C: 전략적 우위 ✅ 부분 완료

### C-1. 자동 프로모션 — ⏳ 미구현
### C-2. 네이버 SEO 최적화 ✅ (seo-optimizer)
### C-3. 일일 수익 리포트 + 이상 탐지 ✅ (anomaly-detector 모듈, daily-report.job.ts는 미생성)

## 다음 세션 TODO

1. `daily-report.job.ts` 생성 (anomaly-detector 연결)
2. `review-monitor.job.ts` 생성
3. API 엔드포인트: rejection analysis, niche analysis, SEO preview
4. DB 스키마 필드 추가: reviewCount, boostModeActivated, optimizedName, searchTags
5. worker index.ts에 cron 등록
6. 커밋 + PR 생성

---

## 이전 계획

<details>
<summary>2026-03-09: 완벽화 계획 (Round 1~4 + Phase A~D 완료)</summary>

- Round 1: 대시보드 UI + 톡톡 자동응답
- Round 2: 이미지 업로드 + 블로그 포스팅
- Round 3: 구매대행 (알리/타오바오 크롤러, 환율, 관세)
- Phase A~D: 코드 품질, 테스트 보강, 설정 가이드
- Round 4: Naver 통합 테스트 61개, 대시보드 UI 완성

</details>
