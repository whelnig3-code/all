"""
수남리 숙주 재배 리포트 생성기 - 설정 및 상수 정의

안평리(anpyeong-report-v5)와 다른 수남리 고유 설정:
  - 재배사 8개 (안평리: 5개)
  - 살수 시간: 시루 개수 기반 계산 (안평리: 집수정온도 기반 45/50분)
  - 임계값: 품온 27℃, CO2 6000ppm (안평리: 28℃, 10000ppm)
  - 날씨: 파일 컬럼 우선 → Meteostat 폴백 (안평리: 파일 컬럼만)
  - 라인 개념 없음 (안평리: 라인 ID + 순차 살수)
"""

import math


class SunamriConfig:
    """수남리 재배 모니터링 분석에 사용되는 모든 설정값."""

    def __init__(self):
        # 기본 살수 시간대
        self.DEFAULT_HOURS = [0, 4, 8, 12, 16, 20]

        # 재배사별 살수 스케줄 (시간) - 수남리는 8개 재배사
        self.ROOM_SCHEDULES = {
            1: [1, 5, 9, 13, 17, 21],
            2: [3, 7, 11, 15, 19, 23],
            3: [0, 4, 8, 12, 16, 20],
            4: [2, 6, 10, 14, 18, 22],
            5: [0, 4, 8, 12, 16, 20],
            6: [2, 6, 10, 14, 18, 22],
            7: [1, 5, 9, 13, 17, 21],
            8: [3, 7, 11, 15, 19, 23],
        }

        # 경고 임계값 (수남리 기준 - 안평리와 다름)
        self.THRESHOLDS = {
            "swing_room": 3.0,       # 재배사 온도 변동폭 경고 (℃)
            "limit_prod": 27.0,      # 품온 상한 (℃) ← 안평리는 28.0
            "limit_co2": 6000.0,     # CO2 상한 (ppm) ← 안평리는 10000.0
        }

        # 시루 개수 범위
        self.TRAY_MIN = 10
        self.TRAY_MAX = 20
        self.TRAY_DEFAULT = 20

        # 원본 헤더 → 표준 컬럼명 매핑 키워드 (안평리에서 이식)
        # 주의: "재배사온도(℃)" 키워드는 "재배사온도"를 포함해야 함
        # 센서 파일에 "재배사"(재배사 번호, 값=1) 컬럼이 별도 존재하므로
        # "재배사"만으로 매칭하면 재배사 번호 컬럼이 잘못 선택됨
        self.HEADER_MAPPING_KEYWORDS = {
            "재배사온도(℃)": ["재배사온도", "실내온도", "내부온도", "RoomTemp", "Room_T"],
            "품온(℃)": ["품온", "Prod"],
            "CO2농도(ppm)": ["CO2", "이산화", "co2"],
            "살수온도(℃)": ["수온", "살수", "Water"],
            "외부기온(℃)": ["외기", "외부", "Ext", "outdoor"],
            "dt": ["일시", "Date", "Time", "시간"],
        }

        # 헤더 매핑 우선 순서
        self.MAPPING_ORDER = [
            "dt",
            "품온(℃)",
            "살수온도(℃)",
            "재배사온도(℃)",
            "CO2농도(ppm)",
            "외부기온(℃)",
        ]

        # 수동 컬럼명 오버라이드
        # 키: 원본 헤더명 (대소문자·공백 무시), 값: 표준 컬럼명
        self.HEADER_ALIASES = {}

        # 표준 센서 컬럼 목록 (수남리는 집수정 없음)
        self.SENSOR_COLUMNS = [
            "재배사온도(℃)",
            "품온(℃)",
            "살수온도(℃)",
            "CO2농도(ppm)",
            "외부기온(℃)",
        ]

        # 내부 컬럼명 → 한글 표시명
        # 수남리는 살수온도를 지하수(GW) / 온수(Hot)로 분리 분석 ← 안평리와 다른 핵심 차이
        self.COL_MAP = {
            "event_id": "이벤트ID",
            "day_index": "일차",
            "event_no": "회차",
            "date_only": "날짜",
            "start_time_only": "시작시간",
            "end_time_only": "종료시간",
            "duration_min": "살수시간(분)",
            "WinA_Room_Min": "재배사_최저",
            "WinA_Room_Max": "재배사_최고",
            "WinA_Room_Avg": "재배사_평균",
            "WinA_Prod_Min": "품온_최저",
            "WinA_Prod_Max": "품온_최고",
            "WinA_Prod_Avg": "품온_평균",
            "WinA_CO2_Min": "CO2_최저",
            "WinA_CO2_Max": "CO2_최고",
            "WinA_CO2_Avg": "CO2_평균",
            # 지하수 (살수 초반 - 지하수 구간)
            "GW_Min": "지하수_최저",
            "GW_Max": "지하수_최고",
            "GW_Avg": "지하수_평균",
            # 온수 (살수 후반 - 온수 구간)
            "Hot_Min": "온수_최저",
            "Hot_Max": "온수_최고",
            "Hot_Avg": "온수_평균",
            "date": "날짜",
            "event_count": "살수횟수",
            "Room_Min": "재배사_최저",
            "Room_Max": "재배사_최고",
            "Room_Avg": "재배사_일평균",
            "Prod_Min": "품온_최저",
            "Prod_Max": "품온_최고",
            "Prod_Avg": "품온_일평균",
            "CO2_Min": "CO2_최저",
            "CO2_Max": "CO2_최고",
            "CO2_Avg": "CO2_일평균",
            "Daily_GW_Avg": "지하수_일평균",
            "Daily_Hot_Avg": "온수_일평균",
            "Ext_Min": "외부_최저기온",
            "Ext_Max": "외부_최고기온",
            "Ext_Avg": "외부_평균기온",
            "Warn_Room": "경고_재배사",
            "Warn_Prod": "경고_품온",
            "Warn_CO2": "경고_CO2",
            "Prod_Exceed_Min": "품온초과(분)",
            "CO2_Exceed_Min":  "CO2초과(분)",
            "Room_Day_Avg":    "재배사_주간평균",
            "Room_Night_Avg":  "재배사_야간평균",
            "Cooling_Delta": "냉각효과(℃)",
        }

        # 날씨 데이터 기상 관측소 (이천)
        self.WEATHER_STATION_ID = "47203"
        self.WEATHER_STATION_LAT = 37.28
        self.WEATHER_STATION_LON = 127.44
        self.WEATHER_STATION_ALT = 70

    def calculate_duration(self, n_trays: int) -> int:
        """
        시루 개수 기반 살수 시간(분) 계산.

        수남리 고유 로직 (안평리는 집수정온도 기반).

        Parameters
        ----------
        n_trays : int
            시루(트레이) 개수 (10~20)

        Returns
        -------
        int
            살수 시간(분)
        """
        n = max(self.TRAY_MIN, min(self.TRAY_MAX, n_trays))
        return int(round(math.ceil(n / 2) * 5.4))


class AnpyeongConfig:
    """
    안평리 재배 모니터링 분석 설정.

    수남리와의 주요 차이:
      - 임계값: 품온 28℃, CO2 10,000ppm
      - 날씨: 파일에 외기온 컬럼 포함 (Meteostat 사용 안 함)
      - 센서 컬럼: 집수정온도(℃) 추가
      - 헤더 키워드: 실내온도/외기온/집수정/물온도 등 안평리 고유 패턴
      - 라인(line_id) 개념 있음 (파일명에서 감지)
      - 살수 시간: 시루 개수 기반 (집수정온도 NaN 가능 → 0도로 채움)
    """

    def __init__(self):
        # 기본 살수 시간대
        self.DEFAULT_HOURS = [0, 4, 8, 12, 16, 20]

        # 재배사별 살수 스케줄 (수남리와 동일)
        self.ROOM_SCHEDULES = {
            1: [1, 5, 9, 13, 17, 21],
            2: [3, 7, 11, 15, 19, 23],
            3: [0, 4, 8, 12, 16, 20],
            4: [2, 6, 10, 14, 18, 22],
            5: [0, 4, 8, 12, 16, 20],
            6: [2, 6, 10, 14, 18, 22],
            7: [1, 5, 9, 13, 17, 21],
            8: [3, 7, 11, 15, 19, 23],
        }

        # 경고 임계값 (안평리 기준 - 수남리와 다름)
        self.THRESHOLDS = {
            "swing_room": 3.0,
            "limit_prod": 28.0,       # 수남리: 27.0
            "limit_co2": 10000.0,     # 수남리: 6000.0
        }

        # 시루 개수 범위
        self.TRAY_MIN = 10
        self.TRAY_MAX = 20
        self.TRAY_DEFAULT = 20

        # 안평리 컬럼 키워드 매핑
        # 안평리 파일 예: '실내온도(2재배사)', 'co2(2재배사)', '수온2(살수온도1,2)',
        #              '외기온(외부기온)', '물온도(집수정 온도)', '품온2(품온1,2)'
        self.HEADER_MAPPING_KEYWORDS = {
            "재배사온도(℃)": ["실내온도", "재배사온도", "내부온도", "RoomTemp", "Room_T"],
            "품온(℃)":      ["품온", "Prod"],
            "CO2농도(ppm)": ["CO2", "이산화", "co2"],
            "살수온도(℃)":  ["수온", "살수", "Water"],
            "외부기온(℃)":  ["외기온", "외기", "외부기온", "Ext", "outdoor"],
            "집수정온도(℃)": ["집수정", "물온도"],
            "dt":           ["일시", "Date", "Time", "시간"],
        }

        # 헤더 매핑 우선 순서
        self.MAPPING_ORDER = [
            "dt",
            "품온(℃)",
            "살수온도(℃)",
            "재배사온도(℃)",
            "CO2농도(ppm)",
            "외부기온(℃)",
            "집수정온도(℃)",
        ]

        # 수동 컬럼명 오버라이드
        self.HEADER_ALIASES = {}

        # 표준 센서 컬럼 목록 (안평리는 집수정온도 있음)
        self.SENSOR_COLUMNS = [
            "재배사온도(℃)",
            "품온(℃)",
            "살수온도(℃)",
            "CO2농도(ppm)",
            "외부기온(℃)",
            "집수정온도(℃)",
        ]

        # 내부 컬럼명 → 한글 표시명
        self.COL_MAP = {
            "event_id":        "이벤트ID",
            "day_index":       "일차",
            "event_no":        "회차",
            "date_only":       "날짜",
            "start_time_only": "시작시간",
            "end_time_only":   "종료시간",
            "duration_min":    "살수시간(분)",
            "WinA_Room_Min":   "재배사_최저",
            "WinA_Room_Max":   "재배사_최고",
            "WinA_Room_Avg":   "재배사_평균",
            "WinA_Prod_Min":   "품온_최저",
            "WinA_Prod_Max":   "품온_최고",
            "WinA_Prod_Avg":   "품온_평균",
            "WinA_CO2_Min":    "CO2_최저",
            "WinA_CO2_Max":    "CO2_최고",
            "WinA_CO2_Avg":    "CO2_평균",
            # 이벤트별 살수온도 (GW/Hot 분리는 수남리 고유, 안평리는 미사용)
            "GW_Min":          "살수온도_이벤트최저",
            "GW_Max":          "살수온도_이벤트최고",
            "GW_Avg":          "살수온도_이벤트평균",
            "Hot_Min":         "살수온도_후반최저",
            "Hot_Max":         "살수온도_후반최고",
            "Hot_Avg":         "살수온도_후반평균",
            "date":            "날짜",
            "event_count":     "살수횟수",
            "Room_Min":        "재배사_최저",
            "Room_Max":        "재배사_최고",
            "Room_Avg":        "재배사_일평균",
            "Prod_Min":        "품온_최저",
            "Prod_Max":        "품온_최고",
            "Prod_Avg":        "품온_일평균",
            "CO2_Min":         "CO2_최저",
            "CO2_Max":         "CO2_최고",
            "CO2_Avg":         "CO2_일평균",
            # 안평리 고유: 살수온도 일별 최저/최고/평균 (단일 온도)
            "Water_Min":       "살수온도_최저",
            "Water_Max":       "살수온도_최고",
            "Water_Avg":       "살수온도_일평균",
            # Daily_GW/Hot은 안평리에서 미사용 (desired_cols에 없으므로 드롭됨)
            "Daily_GW_Avg":    "_gw_unused",
            "Daily_Hot_Avg":   "_hot_unused",
            "Ext_Min":         "외부_최저기온",
            "Ext_Max":         "외부_최고기온",
            "Ext_Avg":         "외부_평균기온",
            "Warn_Room":       "경고_재배사",
            "Warn_Prod":       "경고_품온",
            "Warn_CO2":        "경고_CO2",
            "Prod_Exceed_Min": "품온초과(분)",
            "CO2_Exceed_Min":  "CO2초과(분)",
            "Room_Day_Avg":    "재배사_주간평균",
            "Room_Night_Avg":  "재배사_야간평균",
            "Cooling_Delta":   "냉각효과(℃)",
        }

        # 날씨 데이터: 파일 컬럼에서 가져옴 (Meteostat 사용 안 함)
        self.WEATHER_FROM_FILE = True
        self.WEATHER_STATION_ID = None
        self.WEATHER_STATION_LAT = None
        self.WEATHER_STATION_LON = None
        self.WEATHER_STATION_ALT = None

    def calculate_duration(self, n_trays: int) -> int:
        """시루 개수 기반 살수 시간(분) 계산 (수남리와 동일 공식)."""
        n = max(self.TRAY_MIN, min(self.TRAY_MAX, n_trays))
        return int(round(math.ceil(n / 2) * 5.4))
