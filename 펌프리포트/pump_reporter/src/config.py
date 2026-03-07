"""전역 설정 관리.

경로 상수는 src.paths에서 가져옴 (v4.4.2).
이 모듈은 설정값(DEFAULT_SETTINGS)과 load/save만 담당.
기존 임포트 호환을 위해 paths의 상수를 re-export.
"""
import json

# ── 경로 re-export (하위 호환) ────────────────────────────────
from src.paths import (                     # noqa: F401
    BASE_DIR, INSTALL_DIR, APP_DATA_DIR,
    INPUT_DIR, OUTPUT_DIR,
    REPORTS_DIR, WEEKLY_DIR, MONTHLY_DIR, QUARTERLY_DIR, YEARLY_DIR,
    CHARTS_DIR, CACHE_DIR,
    DATA_DIR, DB_PATH, SETTINGS_PATH, PUMP_STATE_PATH,
    LOG_DIR, LOG_PATH,
    LOGO_PATH,
    resource_path, get_app_data_dir, ensure_dirs,
)

# 기본 설정값
DEFAULT_SETTINGS = {
    "site_name": "안평리",
    "data_rate_threshold": 50.0,
    "min_data_points": 7,
    "min_data_points_by_type": {
        "weekly": 3,
        "monthly": 10,
        "quarterly": 30,
        "yearly": 120,
    },
    "degradation_severe": -20.0,
    "degradation_warning": -10.0,
    "degradation_watch": -5.0,
    "baseline_days": 7,
    "timer_hour_concentration_threshold": 0.6,
    "on_threshold_default": 0.1,
    "auto_watch_enabled": True,
    "watch_interval_seconds": 5,
    "dark_mode": False,
    # v3.1: 기준선 설정
    "auto_baseline_days": 90,
    "baseline_top_percent": 0.1,
    "baseline_min_samples": 45,
    # v3.1: 역할 추정 기준
    "role_main_duty_min": 0.80,
    "role_timer_duty_max": 0.80,
    "role_timer_duty_min": 0.20,
    "role_timer_min_events": 2.0,
    "role_assist_duty_max": 0.30,
    # v3.1: 역할별 하락 임계값 (timer/assist용 완화)
    "degradation_severe_relaxed": -25.0,
    "degradation_warning_relaxed": -12.0,
    "degradation_watch_relaxed": -7.0,
    # v3.2: 가동시간 감소율 임계값
    "on_time_degradation_severe": -30.0,
    "on_time_degradation_warning": -15.0,
    "on_time_degradation_watch": -8.0,
    # v3.3: 타이머 이상 정밀화
    "micro_off_max_minutes": 120,
    "micro_cycle_min_count": 3,
    "timer_flow_risk_weight": 0.7,
    # v3.5: 교체 후 기준선
    "post_casing_baseline_days": 60,
    "post_casing_min_days": 30,
    # v3.5.1: 교체 예측 모델
    "forecast_window_days": 180,
    "forecast_min_days": 90,
    "forecast_threshold_pct": -20.0,
    # v4.1: 7일 rolling drop 임계값
    "rolling_7d_drop_threshold": -5.0,
    # v4.4: 안정화 버퍼
    "action_confirm_days": 2,
}


def load_settings() -> dict:
    if SETTINGS_PATH.exists():
        with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
            saved = json.load(f)
        # 이전 설정 호환: missing_rate_threshold → data_rate_threshold
        if "missing_rate_threshold" in saved and "data_rate_threshold" not in saved:
            saved["data_rate_threshold"] = saved.pop("missing_rate_threshold")
        merged = {**DEFAULT_SETTINGS, **saved}
        return merged
    return dict(DEFAULT_SETTINGS)


def save_settings(settings: dict):
    with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)
