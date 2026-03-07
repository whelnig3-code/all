# 지하수 펌프 유량 분석 시스템 (Pump Reporter)

HTML 기반 `.xls` 파일을 입력받아 지하수 펌프별 유량을 분석하고,
그래프 포함 Excel 리포트를 자동 생성하는 Windows 데스크톱 프로그램입니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **데이터 추출** | HTML table 기반 `.xls` 파일 자동 파싱 (pandas + BeautifulSoup fallback) |
| **펌프 마스터 관리** | 펌프 기본정보(ID, 위치, 용량, 점검주기) CRUD |
| **케이싱 이력 관리** | 교체 이벤트 등록, 기준선 자동 초기화(reset_baseline) |
| **자동 분석** | 결측률, 타이머운전 탐지, 유량 저하율, 주기초과 판정 |
| **판정 로직** | 데이터부족 → 센서점검 / 저하 ≤-20% 정밀점검 / ≤-10% 점검권장 / ≤-5% 경과관찰 / 정상 |
| **리포트 생성** | 요약 + 펌프별 상세 시트, 유량추이·7일이평·기준선·교체마커 차트 삽입 |
| **폴더 감시** | `input/` 폴더에 파일 드롭 시 자동 분석 실행 (watchdog) |
| **이력 누적** | SQLite DB에 모든 데이터·분석결과 영구 저장 |
| **EXE 배포** | PyInstaller로 원클릭 실행 가능 |

---

## 프로젝트 구조

```
pump_reporter/
├── main.py                  # 엔트리 포인트
├── requirements.txt         # 의존성
├── pump_reporter.spec       # PyInstaller 빌드 스펙
├── build.bat                # 원클릭 빌드 스크립트
├── README.md
├── src/
│   ├── __init__.py
│   ├── config.py            # 경로·설정 관리
│   ├── database.py          # SQLite 스키마·CRUD
│   ├── extractor.py         # HTML/XLS 데이터 추출
│   ├── analyzer.py          # 유량 분석 엔진
│   ├── reporter.py          # Excel 리포트 + 차트 생성
│   ├── watcher.py           # 폴더 감시 (watchdog)
│   └── gui.py               # PySide6 GUI (5탭)
├── input/                   # 데이터 파일 입력 폴더 (자동 감시)
├── output/
│   ├── reports/             # 생성된 Excel 리포트
│   ├── charts/              # 차트 이미지
│   └── cache/               # 캐시
└── data/
    ├── pump_reporter.db     # SQLite 데이터베이스
    ├── settings.json        # 사용자 설정
    └── app.log              # 로그
```

---

## 설치 및 실행

### 개발 환경 실행

```bash
# 1. 의존성 설치
cd pump_reporter
pip install -r requirements.txt

# 2. 실행
python main.py
```

### EXE 빌드 (배포용)

```bash
# 방법 1: 빌드 스크립트
build.bat

# 방법 2: 수동 빌드
pip install -r requirements.txt
pyinstaller pump_reporter.spec --clean --noconfirm
```

빌드 결과: `dist/PumpReporter/PumpReporter.exe`
이 폴더를 통째로 배포하면 됩니다.

---

## 사용 방법

### 1. 데이터 파일 준비

HTML table 형식의 `.xls` 파일을 준비합니다.
파일 구조 예시:

```html
<table>
  <tr><th>날짜</th><th>시간</th><th>PUMP_001</th><th>PUMP_002</th></tr>
  <tr><td>2025-01-01</td><td>0</td><td>12.5</td><td>8.3</td></tr>
  <tr><td>2025-01-01</td><td>1</td><td>12.3</td><td>8.1</td></tr>
  ...
</table>
```

### 2. 분석 실행

- **방법 A**: 메인 탭에서 `파일 선택` → `분석 실행`
- **방법 B**: `input/` 폴더에 파일을 드롭하면 자동 분석

### 3. 펌프 마스터 관리

`펌프 마스터` 탭에서 펌프 기본정보를 등록/수정합니다.
처음 데이터 파일을 처리하면 미등록 펌프는 자동으로 추가됩니다.

### 4. 케이싱 이력 등록

`케이싱 이력` 탭에서 교체 이벤트를 등록합니다.
`기준선 초기화` 체크 시, 교체일 이후 첫 7일 평균으로 새 기준선을 설정합니다.

### 5. 리포트 확인

`output/reports/` 폴더에 Excel 파일이 생성됩니다.
각 리포트에는 요약 시트와 펌프별 상세 시트(차트 포함)가 들어 있습니다.

---

## 판정 기준

| 저하율 | 판정 |
|--------|------|
| ≤ -20% | 정밀점검 필요 |
| ≤ -10% | 점검권장 |
| ≤ -5%  | 경과관찰 |
| > -5%  | 정상 |

추가 판정:
- **데이터부족**: 결측률 >50% 또는 데이터 포인트 <7일 → "센서/수집 점검 우선"
- **타이머운전 감지**: 특정 6시간에 데이터 60% 이상 집중
- **주기점검 필요**: 마지막 교체 후 목표 점검주기 초과

---

## DB 스키마

| 테이블 | 설명 |
|--------|------|
| `pumps` | 펌프 마스터 (ID, 명칭, 위치, 용량, 설치일, 점검주기) |
| `casing_history` | 케이싱 교체 이력 (교체일, 사유, 기준선초기화 여부) |
| `daily_flow` | 시간별 유량 원본 데이터 |
| `baselines` | 기준선 이력 (값, 설정일, 사유) |
| `analysis_results` | 분석 결과 누적 이력 |

---

## 설정

`설정` 탭 또는 `data/settings.json`에서 변경 가능:

```json
{
  "missing_rate_threshold": 50.0,
  "min_data_points": 7,
  "degradation_severe": -20.0,
  "degradation_warning": -10.0,
  "degradation_watch": -5.0,
  "baseline_days": 7,
  "timer_hour_concentration_threshold": 0.6,
  "auto_watch_enabled": true,
  "watch_interval_seconds": 5
}
```
