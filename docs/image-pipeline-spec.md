# 이미지 처리 파이프라인 스펙 (Phase 3)

## 목표
상품 등록 파이프라인에 "이미지 내 텍스트(중/영) → 한국어 번역 → 금칙어 필터 → 템플릿 기반 이미지 재삽입 → 네이버 이미지 업로드 + 상세 HTML 반영" 자동화.
**실패 시 등록 중단 금지(degrade)** — 원본 이미지로 계속 진행.
**기존 가격/노출/포트폴리오/중복/uniqueKey 로직 변경 금지.**

---

## STEP 0. 환경 전제

| 항목 | 값 |
|------|-----|
| OCR 엔진 | PaddleOCR (CPU/GPU 모두 허용, GPU: 5060) |
| 번역 | Ollama HTTP (로컬) |
| 이미지 처리 | Pillow (Python) — 인페인팅 금지, 템플릿 박스 덮어쓰기만 허용 |
| 이미지 생성 금지 | 실제 제품을 바꿔 보이게 만드는 생성 이미지 사용 금지 |
| 브랜드 추가 금지 | 이미지에 브랜드 로고/상표 추가 금지 |

### 필요 env (.env.example 반영 필수)
```env
OCR_ENGINE=paddleocr
OLLAMA_BASE_URL=http://localhost:11434
TRANSLATION_MODEL=qwen2.5:7b-instruct
IMAGE_FONT_PATH=           # 한글 폰트 경로
IMAGE_OUTPUT_DIR=./data/generated
NAVER_IMAGE_UPLOAD_ENABLED=true
```

---

## STEP 1. Python 스크립트

### scripts/ocr_extract.py
- 입력: `image_path`
- 출력(JSON): `{ "lines": [{ "text": "...", "bbox": [x1,y1,x2,y2], "lang": "zh|en|unknown" }] }`
- PaddleOCR 사용, `angle_cls=True`
- 실패 시 `lines: []` 반환

### scripts/redesign_image.py
- 입력: `input_image_path`, `output_image_path`, `title_ko`, `bullets_ko[]`
- 동작:
  - 1000×1000 (또는 1200×1200) 정사각형으로 리사이즈/패딩
  - 상단 18~22%: 흰색 박스 + `title_ko`
  - 하단 22~28%: 흰색 박스 + `bullets_ko` 최대 3개
  - 폰트: `IMAGE_FONT_PATH` (한글)
  - 인페인팅 금지 — 박스 덮어쓰기만
- 실패 시 `exit(1)`

> `batch_pipeline.py` 생성 금지 — Node에서 순차 실행

---

## STEP 2. Node/TS 모듈

### packages/core/src/content/ocr.ts
```typescript
export async function ocrExtract(imagePath: string): Promise<string[]>
// child_process로 scripts/ocr_extract.py 호출
// 실패 시 [] 반환
```

### packages/core/src/content/translate.ts
```typescript
export async function translateToKorean(texts: string[]): Promise<string[]>
// Ollama HTTP batch 번역
// 전처리: 길이<2, 특수문자만인 텍스트 제거
// 실패 시 원문 유지
```

### packages/core/src/content/policy-filter.ts
```typescript
export function sanitizeMarketingPhrases(koTexts: string[]): string[]
// 금칙/리스크 표현 제거·치환:
//   최고→실용적, 100%→삭제, 절대/완전/무조건/보장/의료/치료/방수(완전방수)/KC인증 보장/정품 보장
// 최대 3개 bullet (18자 내외, 중복 제거)
// 빈 결과 시 기본 bullet:
//   ["가정용 DIY 작업에 적합", "사용이 간편한 구성", "보관/정리에 편리"]
```

### packages/core/src/content/image-redesign.ts
```typescript
export async function redesignImage(params: {
  inputPath: string
  outputPath: string
  titleKo: string
  bulletsKo: string[]
}): Promise<string | null>
// scripts/redesign_image.py 호출
// 성공: outputPath 반환 / 실패: null
```

---

## STEP 3. 네이버 이미지 업로드

### packages/integrations/src/naver/image.ts
```typescript
export async function uploadProductImages(paths: string[]): Promise<string[]>
// 네이버 커머스 API 이미지 업로드
// 실패 시 throw 대신 [] 반환 (degrade)
```
- 업로드 비활성화 또는 실패 시 → 원본 이미지 URL 사용

---

## STEP 4. registration.job.ts 통합

가드 전부 통과한 직후(uniqueKey 통과 이후) 아래 로직 삽입:

```
A) 이미지 다운로드 (대표 1장 + 서브 최대 2장)
   저장 경로: IMAGE_OUTPUT_DIR/{productId}/raw_*.jpg

B) 각 이미지에 대해:
   1. ocrExtract(rawImage)
   2. translateToKorean(texts)
   3. sanitizeMarketingPhrases(translated) → bullets_ko
   4. title_ko = 기존 상품명 정제 (최대 22자, 브랜드명/과장어 제거)
   5. redesignImage(raw → cleaned)
      성공: cleanedPath / 실패: rawPath

C) uploadProductImages(cleanedPaths or rawPaths)
   성공: product.images = 업로드 URL
   실패: product.images = 원본 URL

D) 상세 HTML: 리디자인 이미지 URL을 상단에 포함
   (대표 1장 + 특징 이미지)

E) 실패 정책 (등록 중단 금지)
   단계별 로그 reason:
   - ocr_failed
   - translate_failed
   - redesign_failed
   - naver_upload_failed
```

---

## STEP 5. 테스트 요구사항

### 단위 테스트 (packages/core)
- `sanitizeMarketingPhrases`: 금칙어 제거/치환
- `translateToKorean`: 실패 시 원문 유지 (HTTP mock)

### 통합 테스트 (worker)
| 시나리오 | 기대 결과 |
|----------|----------|
| OCR 실패 | raw 이미지 사용 |
| redesign 실패 | raw 이미지 사용 |
| upload 실패 | 원본 URL 사용 |
| 전체 성공 | cleaned 이미지 URL이 naver payload에 포함 |

### E2E 스모크 테스트
```bash
# OCR
python scripts/ocr_extract.py --image sample.jpg

# 이미지 리디자인
python scripts/redesign_image.py --input sample.jpg --output out.jpg --title "테스트 상품" --bullets "특징1,특징2,특징3"

# registration.job 시뮬레이션 (naver upload mock)
npm run test:smoke -w apps/worker
```
