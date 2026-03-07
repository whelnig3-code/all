# 수남리 숙주 재배 리포트 생성기

안평리(anpyeong-report-v5) 구조 기반으로 고도화한 수남리 공장용 리포트 시스템.

## 안평리 vs 수남리 차이점

| 항목 | 안평리 v6 | 수남리 |
|------|---------|--------|
| UI | customtkinter exe | **Next.js + FastAPI** |
| 재배사 수 | 5개 | **8개** |
| 날씨 데이터 | 파일 컬럼만 | **파일 우선 → Meteostat 폴백** |
| 살수 시간 결정 | 집수정온도 기반 (45/50분) | **시루 개수 기반 계산** |
| 살수온도 분석 | Water (단일) | **지하수(GW) / 온수(Hot) 분리** |
| 라인 개념 | 있음 (순차 살수) | **없음** |
| 품온 임계값 | 28℃ | **27℃** |
| CO2 임계값 | 10,000 ppm | **6,000 ppm** |
| 아키텍처 | engine/ 모듈 분리 | **DDD (domain/application/infrastructure)** |

## 프로젝트 구조

```
sunamri-report/
├── backend/
│   ├── config/
│   │   └── settings.py              # SunamriConfig (수남리 고유 설정)
│   ├── domain/                      # 핵심 비즈니스 로직
│   │   ├── alert/detection_service.py
│   │   ├── sensor/analysis_service.py
│   │   ├── watering/schedule_service.py
│   │   ├── weather/resolution_service.py   # 파일 우선 → API 폴백
│   │   └── report/commentary_service.py
│   ├── application/
│   │   └── pipeline.py              # 전체 분석 파이프라인
│   ├── infrastructure/              # 외부 연동 구현체
│   │   ├── file_processing/         # loader, header_mapper (안평리 이식)
│   │   ├── excel/                   # report_builder (TODO)
│   │   ├── weather/meteostat_client.py
│   │   └── storage/folder_utils.py
│   ├── interfaces/api/              # FastAPI
│   │   ├── main.py
│   │   └── routers/
│   │       ├── batch.py             # POST /upload, GET /batches
│   │       └── report.py            # GET /download
│   └── requirements.txt
└── frontend/                        # Next.js
    ├── app/
    │   ├── layout.tsx
    │   └── page.tsx
    ├── components/
    │   ├── UploadCard.tsx
    │   └── BatchList.tsx
    └── lib/api.ts
```

## 실행 방법

### 백엔드

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env          # 리포트 저장 경로 설정
uvicorn interfaces.api.main:app --reload --port 8000
```

### 프론트엔드

```bash
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

## TODO (다음 작업)

- [ ] `infrastructure/excel/report_builder.py` - 안평리 excel_builder.py 이식 (수남리 설정 반영)
- [ ] Excel 리포트에 지하수/온수 차트 추가
- [ ] PostgreSQL 연동 (배치 이력 DB 저장)
- [ ] 배치 상세 페이지 (`/batch/[id]`)
