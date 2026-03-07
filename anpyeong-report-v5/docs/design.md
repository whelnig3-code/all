# 안평리 숙주 재배 리포트 생성기 v5.0 - 설계 문서

## 1. 개요

기존 v4.5 단일 스크립트를 모듈 분리된 GUI 애플리케이션으로 재설계한다.
Windows 10/11 64bit에서 설치 없이 실행 가능한 단일 exe를 목표로 한다.

## 2. 아키텍처

```
anpyeong-report-v5/
├── app/
│   ├── __init__.py
│   ├── main.py              # 엔트리포인트
│   └── gui.py               # CustomTkinter GUI
├── engine/
│   ├── __init__.py           # 파이프라인 오케스트레이터
│   ├── loader.py             # 파일 로딩 (HTML/Excel/CSV)
│   ├── header_mapper.py      # 헤더 감지·컬럼 매핑·시계열 준비
│   ├── scheduler.py          # 살수 스케줄 생성
│   ├── analyzer.py           # 이벤트 분석·일별 분석
│   ├── alert_detector.py     # 임계값 초과 구간 탐지
│   ├── commentary.py         # 종합 의견 자동 생성
│   ├── excel_builder.py      # Excel 리포트 (차트·서식)
│   └── teams_uploader.py     # Microsoft Graph API 업로드
├── config/
│   ├── __init__.py
│   ├── settings.py           # 상수·임계값·매핑 정의
│   └── teams_config.json     # Azure AD 인증 정보
├── docs/
│   ├── design.md             # 이 문서
│   └── azure_setup_guide.md  # Azure/Teams 설정 가이드
├── requirements.txt
└── build.bat
```

## 3. 핵심 설계 원칙

### 3.1 GUI-엔진 완전 분리
- GUI(`app/gui.py`)는 계산 로직을 포함하지 않는다.
- 엔진(`engine/`)은 GUI를 참조하지 않는다.
- 소통은 `engine.run_pipeline()` 함수와 `progress_callback` 콜백으로만 한다.

### 3.2 파이프라인 구조
```
load_raw_dataframe → detect_header_row → map_and_clean_columns
→ prepare_timeseries → generate_schedule → analyze_events
→ analyze_daily → build_report → (선택) upload_and_notify
```

### 3.3 스레딩
- GUI 메인 스레드는 이벤트 루프만 처리한다.
- 분석 파이프라인은 `threading.Thread`에서 실행한다.
- `app.after()`를 통해 메인 스레드에서 UI를 업데이트한다.

## 4. 모듈별 기능 매핑 (v4.5 → v5.0)

| v4.5 위치 | v5.0 모듈 | 설명 |
|---|---|---|
| `SproutConfig` | `config/settings.py` | 상수·임계값·매핑 |
| `load_and_detect_start` (파일 읽기) | `engine/loader.py` | HTML/Excel/CSV 로딩 |
| `_process_header` (헤더·매핑·정제) | `engine/header_mapper.py` | 헤더 감지·컬럼 매핑·수치 정제 |
| `_process_header` (시계열·메타) | `engine/header_mapper.py` | 리샘플·보간·라인 감지 |
| `generate_schedule` | `engine/scheduler.py` | 살수 스케줄 생성 |
| `_detect_intervals` | `engine/alert_detector.py` | 임계값 초과 구간 탐지 |
| `analyze_data` | `engine/analyzer.py` | 이벤트·일별 분석 |
| `build_commentary` | `engine/commentary.py` | 종합 의견 |
| `save_excel` | `engine/excel_builder.py` | Excel 생성 |
| (신규) | `engine/teams_uploader.py` | Teams/SharePoint 업로드 |
| `__main__` 블록 | `app/gui.py` + `app/main.py` | GUI 및 실행 |

## 5. 데이터 흐름

```
입력 파일 (.xls/.xlsx/.csv/.html)
    ↓
loader.load_raw_dataframe()
    ↓  pd.DataFrame (raw, header=None)
header_mapper.detect_header_row()
header_mapper.map_and_clean_columns()
    ↓  pd.DataFrame (표준 컬럼명, 수치 정제)
header_mapper.prepare_timeseries()
    ↓  (df, room_id, line_id, batch_start_time)
scheduler.generate_schedule()
    ↓  list[dict] (이벤트 목록)
analyzer.analyze_events()
    ↓  pd.DataFrame (이벤트 분석)
analyzer.analyze_daily()
    ↓  (pd.DataFrame, dict) (일별 요약 + 일별 상세)
excel_builder.build_report()
    ↓  .xlsx 파일
teams_uploader.upload_and_notify()  (선택)
    ↓  SharePoint 업로드 + 채널 알림
```

## 6. 출력 파일 구조

```
Desktop/안평리_리포트/
└── 25년 02월 모니터링 데이터/
    └── 2월 20일 생산 1라인 1재배사 (2025-02-14~2025-02-19)모니터링 데이터.xlsx
```

### Excel 시트 구성:
1. **대시보드** - 요약 차트 6종 + 경고 테이블 + 이상 감지 로그
2. **일별_요약** - 6일간 핵심 지표
3. **살수_이벤트_상세분석(±1h)** - 이벤트별 환경 데이터
4. **1~6일차** - 일별 5종 시계열 차트 + 데이터 테이블
5. **종합_리포트** - 요약 + 추이 차트 + 로그 + 종합 의견

## 7. Teams 업로드 흐름

1. `config/teams_config.json`에서 Azure AD 자격정보 로드
2. MSAL Client Credentials로 액세스 토큰 획득
3. Graph API로 SharePoint 문서 라이브러리 업로드
   - 4MB 이하: 단일 PUT
   - 4MB 초과: 업로드 세션 (3MB 청크)
4. Teams 채널에 파일 링크 메시지 게시
5. 실패 시 로컬 파일 유지 + GUI에 실패 메시지 표시

## 8. 빌드

```batch
pyinstaller --onefile --noconsole --clean --name "안평리_리포트_생성기_v5" --add-data "config;config" app/main.py
```

- `--onefile`: 단일 exe
- `--noconsole`: 콘솔 창 없음
- `--add-data`: config 폴더 번들링

## 9. 기존 기능 보존 체크리스트

- [x] HTML/Excel/CSV 다중 형식 로딩
- [x] 자동 헤더 감지 및 키워드 매핑
- [x] 파일명 기반 라인/재배사 번호 감지
- [x] 1분 리샘플 + 선형 보간
- [x] 재배사별 살수 스케줄 (5개 재배사)
- [x] 집수정 온도 기반 살수 시간 결정 (45분/50분)
- [x] 순차 살수 오프셋 (홀수/짝수 라인)
- [x] ±1h 이벤트 분석 (재배사·품온·CO2·살수온도)
- [x] 냉각 효과 계산
- [x] 일별 전일 리인덱스 + 보간
- [x] 살수 시작/종료 마커
- [x] 품온 고온 / CO2 과다 경고 탐지
- [x] 재배사 온도 변동폭 경고
- [x] 대시보드 차트 6종 (재배사·품온·외부기온·CO2·살수온도·냉각효과)
- [x] 경고 테이블 (색상 분류)
- [x] 이상 감지 상세 로그
- [x] 일차별 시계열 차트 5종
- [x] 조건부 서식 (품온≥28, CO2≥6000, 살수중)
- [x] 종합 리포트 (요약·차트·로그·의견)
- [x] 종합 의견 자동 생성
- [x] 다중 파일 일괄 처리
- [x] 자동 파일명·폴더 생성
- [x] Teams/SharePoint 업로드 (신규)
