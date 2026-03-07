"""
안평리 숙주 재배 리포트 생성기 v5.0 - 설정 및 상수 정의
"""


class SproutConfig:
    """재배 모니터링 분석에 사용되는 모든 설정값."""

    def __init__(self):
        # 기본 살수 시간대
        self.DEFAULT_HOURS = [0, 4, 8, 12, 16, 20]

        # 재배사별 살수 스케줄 (시간)
        self.ROOM_SCHEDULES = {
            1: [1, 5, 9, 13, 17, 21],
            2: [3, 7, 11, 15, 19, 23],
            3: [2, 6, 10, 14, 18, 22],
            4: [0, 4, 8, 12, 16, 20],
            5: [2, 6, 10, 14, 18, 22],
        }

        # 경고 임계값
        self.THRESHOLDS = {
            "swing_room": 3.0,       # 재배사 온도 변동폭 경고
            "limit_prod": 28.0,      # 품온 상한
            "limit_co2": 10000.0,    # CO2 상한
        }

        # 원본 헤더 → 표준 컬럼명 매핑 키워드
        self.HEADER_MAPPING_KEYWORDS = {
            "재배사온도(℃)": ["실내", "재배사", "내부", "Room"],
            "품온(℃)": ["품온", "Prod"],
            "CO2농도(ppm)": ["CO2", "이산화", "co2"],
            "살수온도(℃)": ["수온", "살수", "Water"],
            "집수정온도(℃)": ["물온도", "집수정", "Sump"],
            "외부기온(℃)": ["외기", "외부", "Ext"],
            "dt": ["일시", "Date", "Time", "시간"],
        }

        # 내부 컬럼명 → 한글 표시명
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
            "Water_Min": "살수온도_최저",
            "Water_Max": "살수온도_최고",
            "Water_Avg": "살수온도_평균",
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
            "Daily_Water_Avg": "살수온도_일평균",
            "Ext_Min": "외부_최저기온",
            "Ext_Max": "외부_최고기온",
            "Ext_Avg": "외부_평균기온",
            "Warn_Room": "경고_재배사",
            "Warn_Prod": "경고_품온",
            "Warn_CO2": "경고_CO2",
            "Cooling_Delta": "냉각효과(℃)",
            "Sump_Temp": "집수정온도(기준)",
        }

        # 표준 센서 컬럼 목록
        self.SENSOR_COLUMNS = [
            "재배사온도(℃)",
            "품온(℃)",
            "살수온도(℃)",
            "CO2농도(ppm)",
            "외부기온(℃)",
            "집수정온도(℃)",
        ]

        # 헤더 매핑 순서
        self.MAPPING_ORDER = [
            "dt",
            "품온(℃)",
            "살수온도(℃)",
            "재배사온도(℃)",
            "CO2농도(ppm)",
            "외부기온(℃)",
            "집수정온도(℃)",
        ]

        # 수동 컬럼명 오버라이드 (현장 시스템 변경 시 여기에 추가)
        # 키: 원본 헤더명 (대소문자·공백 무시), 값: 표준 컬럼명
        # 예: {"내부온도센서1": "재배사온도(℃)", "Product Temp": "품온(℃)"}
        self.HEADER_ALIASES = {}
