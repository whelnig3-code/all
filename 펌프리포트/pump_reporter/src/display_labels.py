"""사용자 노출용 필드명 한국어 매핑.

내부 키(snake_case) → UI 라벨(한국어) 변환.
미등록 키는 fallback_label()로 처리.
"""

# ── 필드명 → 한국어 라벨 ──────────────────────────────────
DISPLAY_LABELS: dict[str, str] = {
    # 식별/일시
    "pump_id":                      "펌프 ID",
    "pump_name":                    "펌프명",
    "analysis_date":                "분석일",
    "created_at":                   "생성일시",

    # 분석 기간
    "period_start":                 "분석 시작일",
    "period_end":                   "분석 종료일",
    "recent_period_start":          "최근 비교 시작일",
    "recent_period_end":            "최근 비교 종료일",
    "valid_data_days":              "총 유효 데이터 일수",
    "recent_actual_days":           "최근 비교구간 실제 일수",
    "recent_data_warning":          "최근 비교구간 결측 경고",
    "baseline_period_start":        "기준 산출 시작일",
    "baseline_period_end":          "기준 산출 종료일",
    "effective_start":              "유효 시작일",
    "effective_end":                "유효 종료일",
    "effective_days":               "유효 기간(일)",
    "expected_records":             "예상 레코드 수",

    # 데이터 품질
    "valid_start":                  "유효데이터 시작일",
    "valid_end":                    "유효데이터 종료일",
    "valid_days":                   "유효 일수",
    "total_records":                "전체 레코드 수",
    "valid_records":                "유효 레코드 수",
    "data_rate":                    "데이터 수집률(%)",

    # 유량
    "avg_flow":                     "평균 유량(m\u00b3/h)",
    "min_flow":                     "최소 유량(m\u00b3/h)",
    "max_flow":                     "최대 유량(m\u00b3/h)",

    # 기준선
    "baseline_value":               "기준 평균 유량(m\u00b3/h)",
    "baseline_source":              "기준선 출처",
    "auto_baseline":                "자동산출 기준선(m\u00b3/h)",
    "baseline_sample_total":        "기준 산출 유효 샘플 수",
    "baseline_top_n":               "기준 산출 상위 N개",
    "baseline_period_days":         "기준 산출 기간(일)",
    "baseline_warning":             "기준 산출 경고",
    "best_efficiency_baseline":     "최적효율 기준선(m\u00b3/h)",

    # 하락률
    "degradation_pct":              "유량 하락률(%)",
    "best_efficiency_degradation_pct": "최적효율 대비 하락률(%)",
    "group_avg_degradation_pct":    "그룹 평균 하락률(%)",

    # 가동/타이머
    "timer_detected":               "타이머 감지",
    "timer_mode":                   "운전 모드",
    "avg_on_minutes_per_day":       "일평균 가동시간(분)",
    "avg_on_events_per_day":        "일평균 가동횟수(회)",
    "primary_on_window":            "주요 가동시간대",
    "zero_to_positive_transitions": "유량 전환횟수(0→+)",
    "avg_on_duration":              "평균 1회 가동시간(분)",
    "max_on_duration":              "최대 1회 가동시간(분)",
    "daily_avg_on_minutes":         "일평균 가동분(분/일)",
    "duty_cycle":                   "가동률",

    # 가동시간 기준선
    "on_time_baseline":             "가동시간 기준(분/일)",
    "on_time_baseline_source":      "가동시간 기준 출처",
    "on_time_degradation_pct":      "가동시간 감소율(%)",

    # 역할
    "operation_type":               "펌프 역할",
    "operation_type_source":        "역할 판정 출처",

    # v3.3 타이머 정밀화
    "timer_repeat_score":           "반복점수(0~1)",
    "micro_cycle_count":            "미세 OFF 횟수",
    "micro_cycle_detected":         "미세 OFF 감지",
    "flow_risk_weight":             "유량 위험가중치",

    # 판정
    "judgment":                     "판정",
    "status_reason":                "판정 근거",

    # 케이싱/점검
    "days_since_last_casing":       "마지막 케이싱 교체 후 경과일",
    "cycle_exceeded":               "점검주기 초과 여부",

    # 전체 시스템
    "system_wide_drop":             "전체 수량 저하",

    # 교체 후 기준선 (v3.5)
    "post_casing_baseline":         "교체 후 기준선(m\u00b3/h)",
    "post_casing_date":             "마지막 교체일",
    "post_casing_degradation_pct":  "교체 후 대비 하락률(%)",

    # 교체 예측 (v3.5.1)
    "replacement_forecast":         "교체 시점 예측",

    # 성능 사이클 / 기준선 프로필 (v4.0)
    "cycle_start_date":             "성능 사이클 시작일",
    "cycle_id":                     "현재 사이클 ID",
    "cycle_event_type":             "사이클 이벤트 유형",
    "cycle_data_warning":           "사이클 데이터 경고",
    "baseline_profile_id":          "기준선 프로필 ID",
    "baseline_profile_desc":        "기준선 프로필 설명",

    # v4.1: 7일 rolling drop
    "rolling_7d_drop_pct":          "7일 유량 변화율(%)",
    "rolling_drop_streak":          "연속 급락 일수",

    # v4.4: 신뢰도/품질
    "baseline_confidence":          "기준선 신뢰도(0~100)",
    "recent_coverage":              "최근 30일 커버리지(%)",

    # v4.6: 수동 기준선
    "manual_baseline_value":        "수동 기준선 값(m³/h)",

    # 기타
    "report_path":                  "리포트 경로",
}

# 역할 코드 → 한국어
OPERATION_TYPE_KR = {
    "main": "주펌프",
    "timer": "타이머",
    "assist": "보조",
}

# 기준선 출처 → 한국어
BASELINE_SOURCE_KR = {
    "auto": "자동산출(90일 중 유량 상위10% 평균)",
    "db": "DB 저장 기준선",
    "rated_flow": "정격유량(수동 입력)",
    "none": "기준 없음",
    "auto_90d": "자동산출(90일 중 유량 상위10% 평균)",
    "snapshot": "저장된 기준선 프로필",
    "manual": "수동 기준선(운영자 설정)",
}


def fallback_label(key: str) -> str:
    """미등록 키 → 한국어 포맷 변환. snake_case→읽기 가능 형태."""
    return DISPLAY_LABELS.get(key, key.replace("_", " ").title())


def get_label(key: str) -> str:
    """키에 대한 한국어 라벨 반환."""
    return DISPLAY_LABELS.get(key, fallback_label(key))
