"""펌프별 유량 분석 엔진.

분석 항목:
  - 데이터 확보율 (data_rate)
  - 타이머운전 탐지 (시간대 집중)
  - 기준선 대비 변화 (기준선 대비)
  - 주기초과 플래그
  - 종합 판정
"""
import json
import logging
from datetime import datetime, timedelta
from collections import Counter

import pandas as pd
import numpy as np

from src.config import load_settings, PUMP_STATE_PATH
from src.logger import decision_logger, system_logger
from src.database import (
    get_daily_flows, get_daily_averages, get_latest_baseline,
    set_baseline, get_casing_history, get_all_pumps,
    save_analysis_result, get_pump_data_range,
    update_pump_operation_type_auto,
    update_casing_baseline, get_latest_casing_with_baseline,
    invalidate_old_casing_baselines,
    get_baseline_profile, get_latest_reset_event,  # v4.0 / v4.0.1
    get_manual_baseline,  # v4.6
)

logger = logging.getLogger(__name__)


# ── Alert Hook (Requirement [8]) ─────────────────────────
def emit_alert_event(alert: dict):
    """알림 Hook 함수.

    판정이 경고/위험 수준이면 호출된다.
    현재는 로깅만 수행. 향후 이메일/SMS/웹훅 등 연동 가능.

    Args:
        alert: {pump_id, severity, reason, start_date, end_date, timestamp}
    """
    logger.warning(
        f"[ALERT] pump={alert['pump_id']} severity={alert['severity']} "
        f"reason={alert.get('reason', '')[:80]}"
    )


def _date_range_slice(daily_avgs: list[dict], days: int) -> list[dict]:
    """daily_avgs에서 최근 날짜 기준 days일 달력 범위의 레코드 필터링.

    정책 B(유효 데이터 기준): daily_avgs의 최종 날짜를 기준으로 역산.
    daily_avgs[-N:]과 달리, 결측일이 있어도 올바른 달력 기간을 반영.
    예: 최종일=2026-02-18, days=7 → 2026-02-12 ~ 2026-02-18 범위.
    """
    if not daily_avgs:
        return []
    last_date = max(d["date"] for d in daily_avgs)
    start_date = (datetime.strptime(last_date, "%Y-%m-%d")
                  - timedelta(days=days - 1)).strftime("%Y-%m-%d")
    return [d for d in daily_avgs if d["date"] >= start_date]


def _rolling_7d_avg_at_offset(daily_avgs: list[dict],
                               offset_days: int) -> float | None:
    """daily_avgs 최종일에서 offset_days만큼 앞당긴 시점 기준 7일 평균.

    해당 7일 구간에 최소 5일 유효 데이터 필요. 부족하면 None.
    """
    if not daily_avgs:
        return None
    last_date = max(d["date"] for d in daily_avgs)
    end_dt = datetime.strptime(last_date, "%Y-%m-%d") - timedelta(days=offset_days)
    start_dt = end_dt - timedelta(days=6)
    start_s = start_dt.strftime("%Y-%m-%d")
    end_s = end_dt.strftime("%Y-%m-%d")
    vals = [d["avg_flow"] for d in daily_avgs
            if start_s <= d["date"] <= end_s
            and d.get("avg_flow") and d["avg_flow"] > 0]
    if len(vals) < 5:
        return None
    return sum(vals) / len(vals)


def _calculate_rolling_7d_drop(daily_avgs: list[dict]) -> float | None:
    """최근 7일 평균 vs 이전 7일 평균 유량 변화율(%).

    각 구간에 최소 5일 유효 데이터 필요 (노이즈 방지).
    반환: 변화율(%) 또는 None.
    """
    if not daily_avgs or len(daily_avgs) < 10:
        return None
    recent_avg = _rolling_7d_avg_at_offset(daily_avgs, 0)
    prev_avg = _rolling_7d_avg_at_offset(daily_avgs, 7)
    if recent_avg is None or prev_avg is None or prev_avg <= 0:
        return None
    return round(((recent_avg - prev_avg) / prev_avg) * 100, 2)


def _calculate_rolling_drop_streak(daily_avgs: list[dict],
                                    threshold: float = -5.0) -> int:
    """연속 급락 일수: 최근 N일간 7일 이동평균이 threshold 이하인 연속 일수.

    최종일부터 역순으로 offset 0, 1, 2, ... 를 시프트하며 각 시점의
    7일 평균 vs 직전 7일 평균 변화율을 계산. threshold 이하인 연속 일수 반환.
    최대 7일까지 탐색.
    """
    if not daily_avgs or len(daily_avgs) < 14:
        return 0
    streak = 0
    for offset in range(7):  # 최대 7일 탐색
        recent = _rolling_7d_avg_at_offset(daily_avgs, offset)
        prev = _rolling_7d_avg_at_offset(daily_avgs, offset + 7)
        if recent is None or prev is None or prev <= 0:
            break
        drop = ((recent - prev) / prev) * 100
        if drop <= threshold:
            streak += 1
        else:
            break
    return streak


def _calculate_baseline_confidence(result: dict, settings: dict) -> int:
    """기준선 신뢰도(0~100) 산출 (v4.4).

    산식 (4축 가중평균):
      (1) 샘플 충분도: min(sample_total / min_samples, 1.0) * 30
      (2) 기간 충분도: min(valid_data_days / auto_baseline_days, 1.0) * 25
      (3) 분산 안정도: max(0, 1 - cv) * 25  (cv = std/mean)
      (4) 출처 가산점: rated_flow=15, snapshot=12, auto=10, db=5, none=0
    총합 clip(0, 100).
    """
    bl_source = result.get("baseline_source", "none")
    bl_val = result.get("baseline_value")
    sample_total = result.get("baseline_sample_total") or 0
    valid_days = result.get("valid_data_days", 0)
    min_samples = settings.get("baseline_min_samples", 45)
    auto_bl_days = settings.get("auto_baseline_days", 90)

    if bl_val is None or bl_source == "none":
        return 0

    # v4.6: 수동 기준선 → 신뢰도 100 (운영자 의존이므로 가중치 0.9 적용)
    if bl_source == "manual":
        return 90  # 100 * 0.9

    # (1) 샘플 충분도 (30점)
    sample_score = min(sample_total / max(min_samples, 1), 1.0) * 30

    # (2) 기간 충분도 (25점)
    period_score = min(valid_days / max(auto_bl_days, 1), 1.0) * 25

    # (3) 분산 안정도 (25점) — auto baseline의 경우만 의미
    # cv 정보가 없으면 샘플 기반 추정
    if sample_total >= 10:
        cv_score = 25  # 충분한 샘플이면 안정 간주
    elif sample_total >= 3:
        cv_score = 15
    else:
        cv_score = 5

    # (4) 출처 가산점 (20점)
    # v4.4.1: rated_flow/snapshot 과대 신뢰 리스크 축소
    source_bonus = {
        "rated_flow": 15, "snapshot": 12, "auto": 10,
        "auto_90d": 10, "db": 5, "none": 0,
    }.get(bl_source, 5)

    total = sample_score + period_score + cv_score + source_bonus
    return max(0, min(100, round(total)))


def _calculate_recent_coverage(daily_avgs: list[dict],
                                coverage_days: int = 30) -> float:
    """최근 N일 데이터 커버리지(0~100%) 산출 (v4.4).

    최근 coverage_days 달력일 중 유효 데이터가 존재하는 날의 비율.
    """
    if not daily_avgs:
        return 0.0
    recent = _date_range_slice(daily_avgs, coverage_days)
    actual_days = len(recent)
    return round((actual_days / coverage_days) * 100, 1)


def classify_action_with_reason(result: dict,
                                 settings: dict = None) -> tuple[str, str]:
    """분류 + 근거를 함께 반환 (v4.4).

    Returns: (category, reason)
      category: "즉시점검"|"교체계획"|"예방정비"|"정상"
      reason: "deg_severe"|"months_left"|"rolling"|"deg_warning"|"none"
    """
    if settings is None:
        settings = load_settings()

    j = result.get("judgment", "")
    if j in ("데이터없음", "데이터부족", "분석오류", ""):
        return "정상", "none"

    deg = result.get("degradation_pct")
    forecast = result.get("replacement_forecast")
    rolling_drop = result.get("rolling_7d_drop_pct")
    rolling_streak = result.get("rolling_drop_streak", 0)
    valid_days = result.get("valid_data_days", 0)

    severe = settings.get("degradation_severe", -20.0)
    warning = settings.get("degradation_warning", -10.0)
    rolling_thr = settings.get("rolling_7d_drop_threshold", -5.0)

    # confidence gate
    months_left = None
    if forecast:
        conf = forecast.get("confidence", 0)
        if conf >= 40:
            months_left = forecast["predicted_months_left"]

    # v4.4: 기준선 신뢰도 & 최근 커버리지
    bl_confidence = result.get("baseline_confidence", 100)
    recent_coverage = result.get("recent_coverage", 100.0)

    category = "정상"
    reason = "none"

    if months_left is not None and months_left <= 3:
        category, reason = "즉시점검", "months_left"
    elif deg is not None and deg <= severe:
        category, reason = "즉시점검", "deg_severe"
    elif (rolling_drop is not None and rolling_drop <= rolling_thr
          and rolling_streak >= 3):
        category, reason = "즉시점검", "rolling"
    elif months_left is not None and 3 < months_left <= 6:
        category, reason = "교체계획", "months_left"
    elif deg is not None and severe < deg <= warning:
        category, reason = "예방정비", "deg_warning"
    elif (rolling_drop is not None and rolling_drop <= rolling_thr
          and rolling_streak < 3):
        category, reason = "예방정비", "rolling"

    # ── 다운그레이드 가드 체인 ─────────────────────────
    # v4.3: 데이터 30일 미만 → months_left/rolling만 다운그레이드
    if (valid_days < 30
            and category in ("즉시점검", "교체계획")
            and reason != "deg_severe"):
        category = "예방정비"

    # v4.4: 기준선 신뢰도 < 50 → deg_severe도 즉시점검 차단
    if (bl_confidence < 50
            and category == "즉시점검"
            and reason == "deg_severe"):
        category = "예방정비"

    # v4.4: 최근 30일 커버리지 < 50% → months_left/rolling 상향 제한
    if (recent_coverage < 50.0
            and category in ("즉시점검", "교체계획")
            and reason in ("months_left", "rolling")):
        category = "예방정비"

    return category, reason


def classify_action_category(result: dict, settings: dict = None) -> str:
    """분류만 반환 (호환용)."""
    cat, _ = classify_action_with_reason(result, settings)
    return cat


# ── v4.4: Action Stability Buffer ─────────────────────────────
_ACTION_SEVERITY = {"정상": 0, "예방정비": 1, "교체계획": 2, "즉시점검": 3}


def _load_pump_state() -> dict:
    """펌프 상태 캐시 로드."""
    if PUMP_STATE_PATH.exists():
        try:
            with open(PUMP_STATE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_pump_state(state: dict):
    """펌프 상태 캐시 저장."""
    try:
        with open(PUMP_STATE_PATH, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
    except OSError as e:
        logger.error(f"pump_state 저장 실패: {e}")
        try:
            system_logger.info({
                "timestamp": datetime.now().isoformat(),
                "event": "pump_state_save_failure",
                "error": str(e),
            })
        except Exception:
            pass


def apply_stability_buffer(pump_id: str, raw_category: str,
                            settings: dict = None) -> dict:
    """안정화 버퍼 적용 (v4.4).

    규칙:
      - 하향(severity 감소): 즉시 반영.
      - 상향(severity 증가): confirm_days(기본 2) 연속 동일 등급 이상 시만 확정.
      - 동일 유지: 카운트 유지.

    Returns:
        {"confirmed": str, "raw": str, "pending_days": int,
         "confirm_target": int, "is_pending": bool}
    """
    if settings is None:
        settings = load_settings()
    confirm_days = settings.get("action_confirm_days", 2)

    state = _load_pump_state()
    ps = state.get(pump_id, {})
    prev_confirmed = ps.get("confirmed", "정상")
    prev_raw = ps.get("raw", "정상")
    pending_count = ps.get("pending_count", 0)

    raw_sev = _ACTION_SEVERITY.get(raw_category, 0)
    prev_sev = _ACTION_SEVERITY.get(prev_confirmed, 0)

    if raw_sev <= prev_sev:
        # 하향 또는 동일 → 즉시 반영
        confirmed = raw_category
        pending_count = 0
    else:
        # 상향 시도
        if raw_category == prev_raw:
            pending_count += 1
        else:
            pending_count = 1  # 새로운 상향 시작

        if pending_count >= confirm_days:
            confirmed = raw_category
            pending_count = 0
        else:
            confirmed = prev_confirmed

    # 상태 저장
    state[pump_id] = {
        "confirmed": confirmed,
        "raw": raw_category,
        "pending_count": pending_count,
        "last_update": datetime.now().strftime("%Y-%m-%d"),
    }
    _save_pump_state(state)

    is_pending = (raw_sev > _ACTION_SEVERITY.get(confirmed, 0))

    return {
        "confirmed": confirmed,
        "raw": raw_category,
        "pending_days": pending_count,
        "confirm_target": confirm_days,
        "is_pending": is_pending,
    }


def get_action_guidance_text(category: str, reason: str,
                              result: dict) -> str:
    """운영 조치 가이드 텍스트 생성 (v4.4).

    category + reason 조합에 따른 구체적 행동 지침.
    """
    deg = result.get("degradation_pct")
    forecast = result.get("replacement_forecast")
    months = (forecast["predicted_months_left"]
              if forecast and forecast.get("confidence", 0) >= 25
              else None)

    templates = {
        ("즉시점검", "deg_severe"): (
            f"유량 하락 {deg:+.1f}%로 심각 수준입니다. "
            "케이싱 손상 또는 임펠러 마모 점검이 필요합니다. "
            "72시간 이내 현장 점검을 권장합니다."
            if deg is not None else
            "심각한 유량 저하가 감지되었습니다. 즉시 현장 점검을 권장합니다."
        ),
        ("즉시점검", "months_left"): (
            f"교체 예상 시점이 {months:.0f}개월 이내입니다. "
            "교체 부품 확보 및 작업 일정을 즉시 수립하세요."
            if months is not None else
            "교체 시점이 임박했습니다. 즉시 교체 계획을 수립하세요."
        ),
        ("즉시점검", "rolling"): (
            "최근 7일간 유량이 연속 급락하고 있습니다. "
            "배관 누수, 밸브 이상 또는 수위 변동을 점검하세요."
        ),
        ("교체계획", "months_left"): (
            f"교체 예상 시점이 약 {months:.0f}개월 후입니다. "
            "교체 부품 발주 및 작업 일정 사전 수립을 권장합니다."
            if months is not None else
            "6개월 이내 교체가 예상됩니다. 사전 계획을 수립하세요."
        ),
        ("예방정비", "deg_warning"): (
            f"유량 하락 {deg:+.1f}%로 주의 수준입니다. "
            "정기 점검 일정을 앞당기거나 운전 패턴을 모니터링하세요."
            if deg is not None else
            "유량 저하 경향이 감지되었습니다. 정기 점검을 권장합니다."
        ),
        ("예방정비", "rolling"): (
            "단기 유량 변동이 감지되었습니다. "
            "추이를 모니터링하고, 지속 시 정밀 점검을 고려하세요."
        ),
    }

    text = templates.get((category, reason))
    if text:
        return text

    if category == "정상":
        return "현재 정상 운전 중입니다. 정기 점검 일정을 유지하세요."
    return "운전 상태를 계속 모니터링하세요."


def calculate_auto_baseline(daily_avgs: list[dict], settings: dict) -> dict | None:
    """자동 기준선 산출 (v3.4.2 / v3.5.2 달력 기준 범위).

    최근 N일(달력 기준) 일평균 유량을 내림차순 정렬 후 상위 10% 평균.
    top_n 최소 3개 보장. 유효 샘플 부족 시 None 반환.
    반환: {"value", "sample_total", "top_n", "period_days", "warning",
           "baseline_period_start", "baseline_period_end"} 또는 None.
    """
    auto_bl_days = settings.get("auto_baseline_days", 90)
    top_percent = settings.get("baseline_top_percent", 0.1)
    min_samples = settings.get("baseline_min_samples", 45)

    # 달력 기준 N일 범위 필터링 (v3.5.2)
    recent = _date_range_slice(daily_avgs, auto_bl_days)
    valid = [d["avg_flow"] for d in recent
             if d.get("avg_flow") and d["avg_flow"] > 0]

    # 실제 산출에 사용된 구간 날짜
    bl_period_start = recent[0]["date"] if recent else ""
    bl_period_end = recent[-1]["date"] if recent else ""

    total = len(valid)
    if total == 0:
        return None

    # 최소 샘플 미달: None 반환
    if total < min_samples:
        return None

    valid.sort(reverse=True)

    if total < 10:
        # 소량 샘플: 전체 평균 + 경고
        return {
            "value": round(float(np.mean(valid)), 2),
            "sample_total": total,
            "top_n": total,
            "period_days": auto_bl_days,
            "warning": "샘플 부족으로 전체 평균 사용",
            "baseline_period_start": bl_period_start,
            "baseline_period_end": bl_period_end,
        }

    top_n = max(3, int(total * top_percent))

    return {
        "value": round(float(np.mean(valid[:top_n])), 2),
        "sample_total": total,
        "top_n": top_n,
        "period_days": auto_bl_days,
        "warning": "",
        "baseline_period_start": bl_period_start,
        "baseline_period_end": bl_period_end,
    }


def infer_operation_type(timer_info: dict, pump_info: dict,
                         settings: dict) -> str:
    """펌프 역할 추정: main / timer / assist.

    우선순위: manual 설정 > 자동 추정.
    자동 추정 기준:
      - main: duty_cycle >= role_main_duty_min (0.80)
      - timer: role_timer_duty_min <= duty < role_timer_duty_max
               AND avg_on_events >= role_timer_min_events
      - assist: duty_cycle <= role_assist_duty_max (0.30)
      - 그 외: main (기본값)
    """
    manual = (pump_info.get("operation_type_manual") or "").strip()
    if manual:
        return manual

    duty = timer_info.get("duty_cycle")
    if duty is None:
        return "main"

    main_min = settings.get("role_main_duty_min", 0.80)
    timer_max = settings.get("role_timer_duty_max", 0.80)
    timer_min = settings.get("role_timer_duty_min", 0.20)
    timer_evt = settings.get("role_timer_min_events", 2.0)
    assist_max = settings.get("role_assist_duty_max", 0.30)

    avg_events = timer_info.get("avg_on_events_per_day") or 0

    if duty >= main_min:
        return "main"
    elif timer_min <= duty < timer_max and avg_events >= timer_evt:
        return "timer"
    elif duty <= assist_max:
        return "assist"
    return "main"


def calculate_auto_on_time_baseline(daily_on_minutes: list[float],
                                     settings: dict) -> float | None:
    """자동 가동시간 기준선 산출 (v3.2).

    최근 N일 일별 ON분 상위 P% 평균.
    최소 baseline_min_samples일 필요. 조건 미달 시 None 반환.
    """
    auto_bl_days = settings.get("auto_baseline_days", 90)
    top_percent = settings.get("baseline_top_percent", 0.1)
    min_samples = settings.get("baseline_min_samples", 45)

    recent = daily_on_minutes[-auto_bl_days:]
    valid = [m for m in recent if m > 0]
    if len(valid) < min_samples:
        return None

    valid.sort(reverse=True)
    top_n = max(1, int(len(valid) * top_percent))
    return round(np.mean(valid[:top_n]), 1)


def analyze_pump(pump_id: str, period_start: str = None,
                 period_end: str = None,
                 period_type: str = "weekly",
                 baseline_profile_id: int = None) -> dict:
    """단일 펌프 분석. 결과 dict 반환.

    Args:
        period_type: "weekly"|"monthly"|"quarterly"|"yearly"
            데이터 부족 판정 기준이 기간 유형에 따라 달라짐.
    """
    settings = load_settings()
    today = datetime.now().strftime("%Y-%m-%d")

    # ── v4.0: 성능 사이클 감지 ─────────────────────────────
    # 최근 리셋 이벤트(케이싱/펌프교체) 이후 데이터만 분석 대상으로 제한
    casing_date, current_cycle_id, cycle_event_type = get_latest_reset_event(pump_id)

    effective_start = period_start
    if casing_date:
        if effective_start:
            effective_start = max(effective_start, casing_date)
        else:
            effective_start = casing_date

    # 유량 데이터 조회 (사이클 범위로 제한)
    flows = get_daily_flows(pump_id, effective_start, period_end)
    daily_avgs = get_daily_averages(pump_id, effective_start, period_end)

    # ── 분석기간 결정 (정책 B: 유효 데이터 기준) ──────────────
    # 정책 B: period_start/end 파라미터가 없으면 daily_avgs의 min/max 사용.
    #          파라미터가 있으면 파라미터 우선(사용자 지정 구간).
    #          daily_avgs가 비어있으면 flows fallback.
    if daily_avgs:
        _all_dates = [d["date"] for d in daily_avgs]
        _period_s = period_start or min(_all_dates)
        _period_e = period_end or max(_all_dates)
    elif flows:
        _period_s = period_start or flows[0]["date"]
        _period_e = period_end or flows[-1]["date"]
    else:
        _period_s = period_start or ""
        _period_e = period_end or ""

    # ── 최근 비교 구간: 달력 기준 N일 범위 (v3.5.2) ──────────
    # daily_avgs[-N:]은 레코드 N개를 꺼내므로 결측일이 있으면
    # 실제 달력 기간이 N일보다 길어지는 문제 발생.
    # → last_date - timedelta(days=N-1) 이후 날짜만 필터링.
    _bl_days = settings.get("baseline_days", 7)
    if daily_avgs:
        _recent_slice = _date_range_slice(daily_avgs, _bl_days)
        _recent_actual_days = len(_recent_slice)
        if _recent_slice:
            _recent_s = _recent_slice[0]["date"]
            _recent_e = _recent_slice[-1]["date"]
        else:
            _recent_s = ""
            _recent_e = ""
    else:
        _recent_s = ""
        _recent_e = ""
        _recent_actual_days = 0

    result = {
        "pump_id": pump_id,
        "analysis_date": today,
        "period_start": _period_s,
        "period_end": _period_e,
        "recent_period_start": _recent_s,
        "recent_period_end": _recent_e,
        "valid_data_days": len(daily_avgs),
        "recent_actual_days": _recent_actual_days,
        "recent_data_warning": "",
        "baseline_period_start": "",
        "baseline_period_end": "",
        "cycle_start_date": casing_date or "",
        "cycle_id": current_cycle_id,
        "cycle_event_type": cycle_event_type or "",
        "cycle_data_warning": "",
        "baseline_profile_id": baseline_profile_id,
        "baseline_profile_desc": "",
        "effective_start": "",
        "effective_end": "",
        "effective_days": 0,
        "expected_records": 0,
        "valid_start": "",
        "valid_end": "",
        "valid_days": 0,
        "total_records": len(flows),
        "valid_records": 0,
        "data_rate": None,
        "avg_flow": None,
        "min_flow": None,
        "max_flow": None,
        "baseline_value": None,
        "baseline_source": "",
        "auto_baseline": None,
        "degradation_pct": None,
        "timer_detected": 0,
        "timer_mode": "",
        "avg_on_minutes_per_day": None,
        "avg_on_events_per_day": None,
        "primary_on_window": "",
        "zero_to_positive_transitions": None,
        "avg_on_duration": None,
        "max_on_duration": None,
        "daily_avg_on_minutes": None,
        "judgment": "",
        "status_reason": "",
        "days_since_last_casing": None,
        "cycle_exceeded": 0,
        "report_path": "",
        "alert_events": [],
        "system_wide_drop": False,
        "operation_type": "",
        "operation_type_source": "",
        "best_efficiency_baseline": None,
        "best_efficiency_degradation_pct": None,
        "group_avg_degradation_pct": None,
        "system_wide_drop_detail": "",
        "duty_cycle": None,
        "on_time_baseline": None,
        "on_time_baseline_source": "",
        "on_time_degradation_pct": None,
        "timer_repeat_score": None,
        "micro_cycle_count": 0,
        "micro_cycle_detected": False,
        "flow_risk_weight": 1.0,
        "post_casing_baseline": None,
        "post_casing_date": "",
        "post_casing_degradation_pct": None,
        "replacement_forecast": None,
        "rolling_7d_drop_pct": None,
        "rolling_drop_streak": 0,
        "baseline_confidence": 0,
        "recent_coverage": 0.0,
        "manual_baseline_value": None,
    }

    if not flows:
        result["judgment"] = "데이터없음"
        result["status_reason"] = "수집된 데이터가 전혀 없습니다. 센서 연결 및 데이터 수집 상태를 확인하세요."
        return result

    # DataFrame 변환
    df = pd.DataFrame(flows)
    df["flow_m3h"] = pd.to_numeric(df["flow_m3h"], errors="coerce")

    # ── 1. 데이터 확보율 (effective period 기반) ───────────────
    expected, eff_s, eff_e, eff_d = _calc_effective_period(
        pump_id, period_start, period_end)
    result["effective_start"] = eff_s
    result["effective_end"] = eff_e
    result["effective_days"] = eff_d
    result["expected_records"] = expected

    valid_count = int(df["flow_m3h"].notna().sum())
    if expected > 0:
        data_rate = round((valid_count / expected) * 100, 1)
    else:
        data_rate = None
    result["data_rate"] = data_rate

    # 유효 데이터 기준 분석기간 산출
    valid_df = df.dropna(subset=["flow_m3h"])
    result["valid_records"] = len(valid_df)

    if valid_df.empty:
        result["judgment"] = "데이터부족"
        result["status_reason"] = (
            f"전체 {len(df):,}건 중 유효 데이터 0건. "
            "센서 오작동 또는 통신 장애가 의심됩니다. 센서/수집 장비를 점검하세요."
        )
        return result

    valid_dates = sorted(valid_df["date"].unique())
    result["valid_start"] = valid_dates[0]
    result["valid_end"] = valid_dates[-1]
    result["valid_days"] = len(valid_dates)

    result["avg_flow"] = round(valid_df["flow_m3h"].mean(), 2)
    result["min_flow"] = round(valid_df["flow_m3h"].min(), 2)
    result["max_flow"] = round(valid_df["flow_m3h"].max(), 2)

    # ── 2. 데이터 확보율 기반 판정 (4단계) ──────────────────────
    min_points_by_type = settings.get("min_data_points_by_type", {
        "weekly": 3, "monthly": 10, "quarterly": 30, "yearly": 120,
    })
    min_points = min_points_by_type.get(
        period_type, settings.get("min_data_points", 7))
    dr_under = (data_rate is not None
                and data_rate < settings["data_rate_threshold"])
    if dr_under or len(daily_avgs) < min_points:
        reasons = []
        if dr_under:
            reasons.append(
                f"데이터 확보율 {data_rate:.1f}%가 임계값 "
                f"{settings['data_rate_threshold']}% 미만"
            )
        if len(daily_avgs) < min_points:
            reasons.append(
                f"유효 일수 {len(daily_avgs)}일이 "
                f"최소 기준 {min_points}일 미달"
            )
        result["judgment"] = "데이터부족"
        result["status_reason"] = (
            f"데이터 부족으로 정밀 분석 불가. {'; '.join(reasons)}. "
            f"유효기간: {result['valid_start']}~{result['valid_end']} "
            f"({result['valid_days']}일). "
            "센서 및 수집 장비 점검을 우선 권장합니다."
        )
        return result

    # ── 3. 타이머운전 탐지 (v2: ON/OFF 패턴 기반) ───────────
    timer_info = _detect_timer_operation_v2(df, pump_id, settings)
    result["timer_detected"] = timer_info["timer_detected"]
    result["timer_mode"] = timer_info["timer_mode"]
    result["avg_on_minutes_per_day"] = timer_info["avg_on_minutes_per_day"]
    result["avg_on_events_per_day"] = timer_info["avg_on_events_per_day"]
    result["primary_on_window"] = timer_info["primary_on_window"]
    result["zero_to_positive_transitions"] = timer_info.get(
        "zero_to_positive_transitions")
    result["avg_on_duration"] = timer_info.get("avg_on_duration")
    result["max_on_duration"] = timer_info.get("max_on_duration")
    result["daily_avg_on_minutes"] = timer_info.get("daily_avg_on_minutes")

    # ── 3.5. 펌프 정보 조회 + 역할 추정 (v3.1) ────────────
    pumps_for_bl = {p["pump_id"]: p for p in get_all_pumps()}
    pump_info_bl = pumps_for_bl.get(pump_id, {})
    rated_flow = pump_info_bl.get("rated_flow", 0) or 0

    result["duty_cycle"] = timer_info.get("duty_cycle")
    result["timer_repeat_score"] = timer_info.get("timer_repeat_score")
    result["micro_cycle_count"] = timer_info.get("micro_cycle_count", 0)
    result["micro_cycle_detected"] = timer_info.get("micro_cycle_detected", False)

    op_type = infer_operation_type(timer_info, pump_info_bl, settings)
    result["operation_type"] = op_type
    result["operation_type_source"] = (
        "manual" if (pump_info_bl.get("operation_type_manual") or "").strip()
        else "auto"
    )
    # v3.3: flow_risk_weight
    if op_type == "timer":
        result["flow_risk_weight"] = settings.get("timer_flow_risk_weight", 0.7)
    else:
        result["flow_risk_weight"] = 1.0

    try:
        update_pump_operation_type_auto(pump_id, op_type)
    except Exception:
        pass

    # ── 3.7. 가동시간 감소율 (v3.2) ─────────────────────────
    rated_hours = pump_info_bl.get("rated_hours", 0) or 0
    daily_on_list = timer_info.get("daily_on_minutes_list", [])

    on_time_bl = None
    on_time_bl_src = "none"

    if rated_hours > 0:
        on_time_bl = round(rated_hours * 60, 1)  # 시간→분 변환
        on_time_bl_src = "rated_hours"
    else:
        auto_on_bl = calculate_auto_on_time_baseline(daily_on_list, settings)
        if auto_on_bl is not None:
            on_time_bl = auto_on_bl
            on_time_bl_src = "auto"

    result["on_time_baseline"] = on_time_bl
    result["on_time_baseline_source"] = on_time_bl_src

    if on_time_bl and on_time_bl > 0:
        current_on = result.get("daily_avg_on_minutes") or 0
        if current_on >= 0:
            on_deg = ((current_on - on_time_bl) / on_time_bl) * 100
            result["on_time_degradation_pct"] = round(on_deg, 1)

    # ── 4. 기준선 처리 (v3: 최고효율 대비 하락률) ────────────
    _handle_casing_baseline(pump_id, settings)

    auto_bl_info = calculate_auto_baseline(daily_avgs, settings) if daily_avgs else None
    auto_bl = auto_bl_info["value"] if auto_bl_info else None
    db_bl_info = get_latest_baseline(pump_id)
    db_bl = db_bl_info["baseline_value"] if db_bl_info and db_bl_info["baseline_value"] else None

    result["auto_baseline"] = auto_bl
    result["baseline_sample_total"] = auto_bl_info["sample_total"] if auto_bl_info else None
    result["baseline_top_n"] = auto_bl_info["top_n"] if auto_bl_info else None
    result["baseline_period_days"] = auto_bl_info["period_days"] if auto_bl_info else None
    result["baseline_warning"] = auto_bl_info.get("warning", "") if auto_bl_info else ""
    # v3.5.2: 기준선 산출에 실제 사용된 구간 날짜
    result["baseline_period_start"] = (
        auto_bl_info.get("baseline_period_start", "") if auto_bl_info else "")
    result["baseline_period_end"] = (
        auto_bl_info.get("baseline_period_end", "") if auto_bl_info else "")

    # v3.5.2: 최근 비교구간 결측 경고
    if _recent_actual_days > 0 and _recent_actual_days < _bl_days:
        result["recent_data_warning"] = (
            f"최근 {_bl_days}일 중 {_recent_actual_days}일만 유효"
            f" (결측 {_bl_days - _recent_actual_days}일)")

    used_baseline = None
    baseline_source = "none"

    # v4.6: 수동 기준선 — 최우선
    manual_bl = get_manual_baseline(pump_id)
    result["manual_baseline_value"] = manual_bl
    if manual_bl is not None:
        used_baseline = manual_bl
        baseline_source = "manual"

    # v4.0: snapshot mode — 저장된 프로필 (수동 미설정 시)
    if used_baseline is None and baseline_profile_id is not None:
        _profile = get_baseline_profile(baseline_profile_id)
        if _profile:
            used_baseline = _profile["baseline_value"]
            baseline_source = "snapshot"
            result["baseline_profile_desc"] = _profile.get("description", "")

    # live mode (기본): 기존 우선순위 cascade
    if used_baseline is None:
        if rated_flow > 0:
            used_baseline = rated_flow
            baseline_source = "rated_flow"
        elif auto_bl is not None:
            used_baseline = auto_bl
            baseline_source = "auto"
        elif db_bl is not None:
            used_baseline = db_bl
            baseline_source = "db"

    # v4.0: 사이클 데이터 30일 미달 — live_mode에서 auto baseline 무효화
    cycle_data_warning = ""
    if casing_date and baseline_profile_id is None:
        post_days = len([d for d in daily_avgs if d["date"] >= casing_date])
        min_days = settings.get("post_casing_min_days", 30)
        if post_days < min_days:
            cycle_data_warning = (
                f"교체 후 {post_days}일 / 최소 {min_days}일 미달")
            if baseline_source == "auto":
                used_baseline = None
                baseline_source = "none"
    result["cycle_data_warning"] = cycle_data_warning

    result["baseline_value"] = used_baseline
    result["baseline_source"] = baseline_source

    # 하락률 산출: 달력 기준 N일 범위 사용 (v3.5.2)
    if used_baseline and used_baseline > 0:
        recent_days = _date_range_slice(daily_avgs, settings["baseline_days"])
        if recent_days:
            recent_avg = np.mean([d["avg_flow"] for d in recent_days])
            deg = ((recent_avg - used_baseline) / used_baseline) * 100
            result["degradation_pct"] = round(deg, 1)

    # v4.1: 7일 rolling drop 산출
    rolling_drop = _calculate_rolling_7d_drop(daily_avgs)
    result["rolling_7d_drop_pct"] = rolling_drop
    # v4.2: 연속 급락 일수
    rolling_thr = settings.get("rolling_7d_drop_threshold", -5.0)
    result["rolling_drop_streak"] = _calculate_rolling_drop_streak(
        daily_avgs, rolling_thr)

    # v4.4: 기준선 신뢰도 & 최근 커버리지
    result["baseline_confidence"] = _calculate_baseline_confidence(
        result, settings)
    result["recent_coverage"] = _calculate_recent_coverage(daily_avgs, 30)

    # best_efficiency 별도 저장 (v3.1: auto_baseline 기준)
    result["best_efficiency_baseline"] = auto_bl
    if auto_bl and auto_bl > 0:
        recent_days_be = _date_range_slice(daily_avgs, settings["baseline_days"])
        if recent_days_be:
            recent_avg_be = np.mean([d["avg_flow"] for d in recent_days_be])
            be_deg = ((recent_avg_be - auto_bl) / auto_bl) * 100
            result["best_efficiency_degradation_pct"] = round(be_deg, 1)

    # ── 4.5 v3.5: 교체 후 기준선 정보 추가 ────────────────
    casing_bl_info = get_latest_casing_with_baseline(pump_id)
    if casing_bl_info:
        pc_bl = casing_bl_info["post_casing_baseline"]
        result["post_casing_baseline"] = pc_bl
        result["post_casing_date"] = casing_bl_info["change_date"]
        # 교체 후 기준선 대비 하락률 별도 산출
        if pc_bl and pc_bl > 0:
            recent_days_pc = _date_range_slice(daily_avgs, settings["baseline_days"])
            if recent_days_pc:
                recent_avg_pc = np.mean(
                    [d["avg_flow"] for d in recent_days_pc])
                pc_deg = ((recent_avg_pc - pc_bl) / pc_bl) * 100
                result["post_casing_degradation_pct"] = round(pc_deg, 1)

    # ── 4.7 v3.5.1: 교체 예측 모델 ─────────────────────────
    forecast_bl = result.get("post_casing_baseline") or used_baseline
    if forecast_bl and forecast_bl > 0 and daily_avgs:
        forecast = _calculate_replacement_forecast(
            daily_avgs, forecast_bl, settings)
        if forecast:
            result["replacement_forecast"] = forecast

    # ── 5. 주기초과 확인 ─────────────────────────────────────
    pumps = {p["pump_id"]: p for p in get_all_pumps()}
    pump_info = pumps.get(pump_id, {})
    inspect_cycle = pump_info.get("inspect_cycle_days", 365)

    casings = get_casing_history(pump_id)
    if casings:
        last_change = casings[0]["change_date"]
        days_since = (datetime.now()
                      - datetime.strptime(last_change, "%Y-%m-%d")).days
        result["days_since_last_casing"] = days_since
        if days_since > inspect_cycle:
            result["cycle_exceeded"] = 1
    else:
        install = pump_info.get("install_date", "")
        if install:
            try:
                days_since = (datetime.now()
                              - datetime.strptime(install, "%Y-%m-%d")).days
                result["days_since_last_casing"] = days_since
                if days_since > inspect_cycle:
                    result["cycle_exceeded"] = 1
            except ValueError:
                pass

    # ── 6. 종합 판정 ─────────────────────────────────────────
    judgment, status_reason = _make_judgment(result, settings)
    result["judgment"] = judgment
    result["status_reason"] = status_reason

    # ── 7. Alert events (향후 알림 확장용 구조) ────────────────
    alert_events = []
    if "정밀점검" in judgment:
        alert_events.append({
            "pump_id": pump_id, "severity": "critical",
            "reason": status_reason,
            "start_date": result.get("valid_start", ""),
            "end_date": result.get("valid_end", ""),
        })
    elif "점검권장" in judgment:
        alert_events.append({
            "pump_id": pump_id, "severity": "warning",
            "reason": status_reason,
            "start_date": result.get("valid_start", ""),
            "end_date": result.get("valid_end", ""),
        })
    elif "경과관찰" in judgment:
        alert_events.append({
            "pump_id": pump_id, "severity": "watch",
            "reason": status_reason,
            "start_date": result.get("valid_start", ""),
            "end_date": result.get("valid_end", ""),
        })
    result["alert_events"] = alert_events

    # Alert hook 호출
    for alert in alert_events:
        alert["timestamp"] = datetime.now().isoformat()
        try:
            emit_alert_event(alert)
        except Exception as e:
            logger.error(f"Alert hook error: {e}")

    # ── v4.4.x: Decision Audit Log ───────────────────────────
    try:
        raw_cat, reason = classify_action_with_reason(result, settings)
        buf = apply_stability_buffer(pump_id, raw_cat, settings)
        forecast = result.get("replacement_forecast")
        decision_logger.info({
            "timestamp": datetime.now().isoformat(),
            "pump_id": pump_id,
            "cycle_start": result.get("cycle_start_date"),
            "baseline_source": result.get("baseline_source"),
            "manual_baseline": result.get("manual_baseline_value"),
            "baseline_confidence": result.get("baseline_confidence"),
            "recent_coverage": result.get("recent_coverage"),
            "degradation_pct": result.get("degradation_pct"),
            "rolling_7d_drop_pct": result.get("rolling_7d_drop_pct"),
            "rolling_drop_streak": result.get("rolling_drop_streak"),
            "forecast_months_left": forecast.get("predicted_months_left") if forecast else None,
            "forecast_confidence": forecast.get("confidence") if forecast else None,
            "valid_data_days": result.get("valid_data_days"),
            "threshold_severe": settings.get("degradation_severe"),
            "threshold_warning": settings.get("degradation_warning"),
            "rolling_threshold": settings.get("rolling_7d_drop_threshold"),
            "raw_category": raw_cat,
            "buffered_category": buf["confirmed"],
            "final_category": buf["confirmed"],
            "reason": reason,
        })
    except Exception:
        pass  # 로그 실패가 분석을 중단시키면 안 됨

    return result


def detect_system_wide_drop(results: list[dict],
                            threshold: float = -10.0) -> bool:
    """전체 시스템 동시 하락 감지.

    유효 하락률이 있는 펌프가 2개 이상이고,
    평균 하락률이 threshold 이하이면 True.
    """
    drops = [r["degradation_pct"] for r in results
             if r.get("degradation_pct") is not None]
    if len(drops) < 2:
        return False
    return (sum(drops) / len(drops)) <= threshold


def analyze_all_pumps(period_start: str = None,
                      period_end: str = None,
                      period_type: str = "weekly") -> list[dict]:
    """DB에 등록된 전체 펌프 분석. 모든 펌프를 항상 포함."""
    pumps = get_all_pumps()
    results = []
    _empty = _make_empty_result("")
    for p in pumps:
        try:
            r = analyze_pump(p["pump_id"], period_start, period_end,
                             period_type)
            save_analysis_result(r)
            results.append(r)
        except Exception as e:
            logger.error(f"펌프 {p['pump_id']} 분석 실패: {e}")
            fallback = dict(_empty)
            fallback["pump_id"] = p["pump_id"]
            fallback["analysis_date"] = datetime.now().strftime("%Y-%m-%d")
            fallback["judgment"] = "분석오류"
            fallback["status_reason"] = f"분석 중 오류 발생: {e}"
            results.append(fallback)

    # ── v3.1: 역할별 그룹 평균 하락률 ──────────────────────
    from collections import defaultdict
    role_groups = defaultdict(list)
    for r in results:
        ot = r.get("operation_type", "main")
        if r.get("degradation_pct") is not None:
            role_groups[ot].append(r["degradation_pct"])

    for r in results:
        ot = r.get("operation_type", "main")
        if role_groups.get(ot):
            r["group_avg_degradation_pct"] = round(
                sum(role_groups[ot]) / len(role_groups[ot]), 1)

    # ── 전체 시스템 동시 하락 감지 (v3.1: 주력 펌프만) ─────
    main_drops = role_groups.get("main", [])
    sys_drop = (len(main_drops) >= 2
                and (sum(main_drops) / len(main_drops)) <= -10.0)
    if sys_drop:
        avg_drop = round(sum(main_drops) / len(main_drops), 1)
        logger.warning(
            f"[SYSTEM] 주력 펌프 수량 동시 하락 감지: "
            f"평균 {avg_drop}% ({len(main_drops)}개 주력 펌프)")
        for r in results:
            r["system_wide_drop"] = True
            r["system_wide_drop_detail"] = (
                f"주력 {len(main_drops)}대 평균 {avg_drop}%")
            if r.get("degradation_pct") is not None:
                r["status_reason"] = (
                    f"[전체 수량 저하 가능성 — 수위 점검 필요 "
                    f"(주력 평균 {avg_drop}%)] "
                    + r.get("status_reason", "")
                )

    return results


def _make_empty_result(pump_id: str) -> dict:
    """모든 필드를 기본값으로 갖는 빈 결과 dict."""
    return {
        "pump_id": pump_id,
        "analysis_date": datetime.now().strftime("%Y-%m-%d"),
        "period_start": "", "period_end": "",
        "recent_period_start": "", "recent_period_end": "",
        "valid_data_days": 0,
        "recent_actual_days": 0,
        "recent_data_warning": "",
        "baseline_period_start": "", "baseline_period_end": "",
        "cycle_start_date": "", "cycle_id": None,
        "cycle_event_type": "",
        "cycle_data_warning": "",
        "baseline_profile_id": None, "baseline_profile_desc": "",
        "effective_start": "", "effective_end": "",
        "effective_days": 0, "expected_records": 0,
        "valid_start": "", "valid_end": "", "valid_days": 0,
        "total_records": 0, "valid_records": 0,
        "data_rate": None,
        "avg_flow": None, "min_flow": None, "max_flow": None,
        "baseline_value": None, "baseline_source": "", "auto_baseline": None,
        "baseline_sample_total": None, "baseline_top_n": None,
        "baseline_period_days": None, "baseline_warning": "",
        "degradation_pct": None,
        "timer_detected": 0,
        "timer_mode": "",
        "avg_on_minutes_per_day": None,
        "avg_on_events_per_day": None,
        "primary_on_window": "",
        "zero_to_positive_transitions": None,
        "avg_on_duration": None,
        "max_on_duration": None,
        "daily_avg_on_minutes": None,
        "judgment": "", "status_reason": "",
        "days_since_last_casing": None, "cycle_exceeded": 0,
        "report_path": "",
        "alert_events": [],
        "system_wide_drop": False,
        "operation_type": "",
        "operation_type_source": "",
        "best_efficiency_baseline": None,
        "best_efficiency_degradation_pct": None,
        "group_avg_degradation_pct": None,
        "system_wide_drop_detail": "",
        "duty_cycle": None,
        "on_time_baseline": None,
        "on_time_baseline_source": "",
        "on_time_degradation_pct": None,
        "timer_repeat_score": None,
        "micro_cycle_count": 0,
        "micro_cycle_detected": False,
        "flow_risk_weight": 1.0,
        "post_casing_baseline": None,
        "post_casing_date": "",
        "post_casing_degradation_pct": None,
        "replacement_forecast": None,
        "rolling_7d_drop_pct": None,
        "rolling_drop_streak": 0,
        "baseline_confidence": 0,
        "recent_coverage": 0.0,
        "manual_baseline_value": None,
    }


def get_pump_trend_data(pump_id: str) -> pd.DataFrame:
    """차트용 일별 평균 유량 + 7일 이동평균 데이터."""
    daily = get_daily_averages(pump_id)
    if not daily:
        return pd.DataFrame()

    df = pd.DataFrame(daily)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date")
    df["ma7"] = df["avg_flow"].rolling(window=7, min_periods=1).mean()
    return df


# ── 내부 함수 ───────────────────────────────────────────────
def _calc_effective_period(pump_id: str,
                           period_start: str = None,
                           period_end: str = None,
                           ) -> tuple[int, str, str, int]:
    """펌프별 유효 데이터 기간(period ∩ pump 데이터 범위) 산출.

    Returns:
        (expected_records, eff_start, eff_end, eff_days)
        데이터 없거나 교집합 없으면 (0, "", "", 0)
    """
    pump_range = get_pump_data_range(pump_id)
    if not pump_range:
        return 0, "", "", 0

    pump_min, pump_max = pump_range

    # period가 지정되면 교집합, 아니면 펌프 전체 범위
    eff_start = max(period_start, pump_min) if period_start else pump_min
    eff_end = min(period_end, pump_max) if period_end else pump_max

    if eff_start > eff_end:
        return 0, "", "", 0

    eff_days = (datetime.strptime(eff_end, "%Y-%m-%d")
                - datetime.strptime(eff_start, "%Y-%m-%d")).days + 1
    return eff_days * 24, eff_start, eff_end, eff_days


def _detect_timer_operation(df: pd.DataFrame,
                            threshold: float) -> bool:
    """(레거시) 특정 시간대에 데이터가 집중되어 있으면 타이머운전으로 판단."""
    if "hour" not in df.columns or df["hour"].isna().all():
        return False

    hour_counts = Counter(df["hour"].dropna().astype(int))
    if not hour_counts:
        return False

    total = sum(hour_counts.values())
    sorted_counts = sorted(hour_counts.values(), reverse=True)
    top_6 = sum(sorted_counts[:6])
    concentration = top_6 / total if total > 0 else 0

    return concentration >= threshold


def _detect_timer_operation_v2(
        df: pd.DataFrame, pump_id: str, settings: dict) -> dict:
    """ON/OFF 패턴 기반 타이머운전 분석 (v2).

    Args:
        df: 전체 데이터 (NULL 포함). columns: date, hour, flow_m3h
        pump_id: 펌프 ID (펌프별 설정 조회용)
        settings: 전역 설정 dict

    Returns:
        {
            "timer_detected": int,
            "timer_mode": str,
            "avg_on_minutes_per_day": float | None,
            "avg_on_events_per_day": float | None,
            "primary_on_window": str,
        }
    """
    empty_result = {
        "timer_detected": 0,
        "timer_mode": "",
        "avg_on_minutes_per_day": None,
        "avg_on_events_per_day": None,
        "primary_on_window": "",
        "avg_on_duration": None,
        "max_on_duration": None,
        "daily_avg_on_minutes": None,
    }

    if df.empty or "hour" not in df.columns:
        return empty_result

    # ── Step A: ON/OFF 분류 ──────────────────────────────
    # 펌프별 on_threshold 조회
    pumps = {p["pump_id"]: p for p in get_all_pumps()}
    pump_info = pumps.get(pump_id, {})
    on_threshold = pump_info.get("on_threshold", 0) or 0
    if on_threshold <= 0:
        on_threshold = settings.get("on_threshold_default", 0.1)

    duty_max = pump_info.get("duty_cycle_timer_max", 0.75) or 0.75
    repeat_window = pump_info.get("timer_repeat_window_minutes", 30) or 30
    repeat_min_days = pump_info.get("timer_repeat_min_days", 3) or 3

    # flow_m3h를 수치로 변환 (원본 df 보호)
    wdf = df[["date", "hour", "flow_m3h"]].copy()
    wdf["flow_num"] = pd.to_numeric(wdf["flow_m3h"], errors="coerce")
    wdf["hour_int"] = pd.to_numeric(wdf["hour"], errors="coerce")

    # 상태 분류: ON / OFF / 미수집(NULL)
    wdf["state"] = "missing"
    mask_valid = wdf["flow_num"].notna()
    wdf.loc[mask_valid & (wdf["flow_num"] > on_threshold), "state"] = "on"
    wdf.loc[mask_valid & (wdf["flow_num"] <= on_threshold), "state"] = "off"

    total_on = (wdf["state"] == "on").sum()
    total_off = (wdf["state"] == "off").sum()
    total_valid = total_on + total_off

    if total_valid == 0:
        return empty_result

    # ── Step B: 일별 통계 ────────────────────────────────
    dates = sorted(wdf["date"].unique())
    daily_stats = []  # list of (on_minutes, on_events, start_hours, zero_to_pos)
    all_on_start_hours = []  # 전체 기간 ON 시작 시각 수집
    all_on_durations = []  # v3: 개별 ON 이벤트 지속시간(분)
    all_off_durations = []  # v3.3: 개별 OFF 이벤트 지속시간(분)
    total_zero_to_pos = 0  # 0→양수 전환 총 횟수

    for d in dates:
        day_df = wdf[wdf["date"] == d].sort_values("hour_int")
        if day_df.empty:
            continue

        states = day_df["state"].values
        hours = day_df["hour_int"].values

        on_count = (states == "on").sum()
        on_minutes = on_count * 60  # 시간 단위 데이터

        # ON 이벤트 (OFF/missing→ON 전환) 카운트 + 시작 시각 수집
        on_events = 0
        zero_to_pos = 0  # 0→양수 전환 횟수
        start_hours = []
        prev_state = "off"  # 하루 시작 전 상태를 off로 가정
        current_on_dur = 0
        current_off_dur = 0  # v3.3: OFF 이벤트 지속시간 추적
        for st, hr in zip(states, hours):
            if st == "on":
                current_on_dur += 60
                if current_off_dur > 0:
                    all_off_durations.append(current_off_dur)
                    current_off_dur = 0
                if prev_state != "on":
                    on_events += 1
                    zero_to_pos += 1
                    if not np.isnan(hr):
                        start_hours.append(int(hr))
            elif st == "off":
                current_off_dur += 60
                if current_on_dur > 0:
                    all_on_durations.append(current_on_dur)
                    current_on_dur = 0
            else:
                # missing: ON/OFF 모두 종료
                if current_on_dur > 0:
                    all_on_durations.append(current_on_dur)
                    current_on_dur = 0
                if current_off_dur > 0:
                    all_off_durations.append(current_off_dur)
                    current_off_dur = 0
            if st != "missing":
                prev_state = st
        if current_on_dur > 0:
            all_on_durations.append(current_on_dur)
        if current_off_dur > 0:
            all_off_durations.append(current_off_dur)

        total_zero_to_pos += zero_to_pos
        daily_stats.append((on_minutes, on_events, start_hours, zero_to_pos))
        all_on_start_hours.extend(start_hours)

    if not daily_stats:
        return empty_result

    on_minutes_list = [s[0] for s in daily_stats]
    on_events_list = [s[1] for s in daily_stats]

    avg_on_min = round(np.mean(on_minutes_list), 1) if on_minutes_list else 0
    avg_on_evt = round(np.mean(on_events_list), 2) if on_events_list else 0

    # v3: 확장 통계
    total_on_minutes = sum(on_minutes_list)
    avg_on_duration = round(np.mean(all_on_durations), 1) if all_on_durations else 0
    max_on_duration = max(all_on_durations) if all_on_durations else 0
    daily_avg_on_min_v3 = round(total_on_minutes / len(dates), 1) if dates else 0

    # ── Step C: 패턴 판정 ────────────────────────────────
    duty_cycle = total_on / total_valid

    # v3.3: timer_repeat_score 산출
    timer_repeat_score = _calc_timer_repeat_score(
        all_on_start_hours, daily_stats, repeat_window, repeat_min_days)

    # v3.3: micro-cycle 감지 (상시가동 펌프의 짧은 OFF 이벤트)
    micro_off_max = settings.get("micro_off_max_minutes", 120)
    micro_min_count = settings.get("micro_cycle_min_count", 3)
    short_offs = [d for d in all_off_durations if 0 < d <= micro_off_max]
    micro_cycle_count = len(short_offs)
    micro_cycle_detected = (duty_cycle >= 0.95
                            and micro_cycle_count >= micro_min_count)

    if duty_cycle >= 0.95:
        timer_mode = "상시가동"
        timer_detected = 0
    elif duty_cycle <= duty_max:
        # v3.3: score 기반 반복/비반복 판정
        if timer_repeat_score >= 0.5:
            timer_mode = "타이머(반복)"
        else:
            timer_mode = "타이머(비반복)"
        timer_detected = 1
    else:
        timer_mode = "간헐가동"
        timer_detected = 0

    # primary_on_window 결정
    primary_window = _calc_primary_on_window(all_on_start_hours)

    return {
        "timer_detected": timer_detected,
        "timer_mode": timer_mode,
        "avg_on_minutes_per_day": avg_on_min,
        "avg_on_events_per_day": avg_on_evt,
        "primary_on_window": primary_window,
        "zero_to_positive_transitions": total_zero_to_pos,
        "avg_on_duration": avg_on_duration,
        "max_on_duration": max_on_duration,
        "daily_avg_on_minutes": daily_avg_on_min_v3,
        "duty_cycle": round(duty_cycle, 4),
        "daily_on_minutes_list": on_minutes_list,
        "timer_repeat_score": round(timer_repeat_score, 3),
        "micro_cycle_count": micro_cycle_count,
        "micro_cycle_detected": micro_cycle_detected,
    }


def _check_repeating_pattern(
        all_start_hours: list[int],
        daily_stats: list,
        window_minutes: int,
        min_days: int) -> bool:
    """ON 시작 시각이 반복 패턴을 보이는지 확인.

    가장 빈번한 시작시각 기준, ±window_minutes 내에
    min_days일 이상 해당 시각에 ON 이벤트가 있으면 반복 패턴.
    """
    if not all_start_hours or len(daily_stats) < min_days:
        return False

    # 시작시각 빈도 카운트
    hour_counts = Counter(all_start_hours)
    if not hour_counts:
        return False

    most_common_hour, count = hour_counts.most_common(1)[0]

    # window를 시간 단위로 변환 (시간 단위 데이터이므로)
    window_hours = max(1, window_minutes // 60)

    # ±window_hours 범위 내 시작시각이 있는 날 수 카운트
    days_with_pattern = 0
    for item in daily_stats:
        start_hours = item[2]
        for sh in start_hours:
            if abs(sh - most_common_hour) <= window_hours:
                days_with_pattern += 1
                break
            # 자정 근처 wrap-around 처리
            if abs(sh - most_common_hour + 24) <= window_hours:
                days_with_pattern += 1
                break
            if abs(sh - most_common_hour - 24) <= window_hours:
                days_with_pattern += 1
                break

    return days_with_pattern >= min_days


def _calc_timer_repeat_score(
        all_start_hours: list[int],
        daily_stats: list,
        window_minutes: int,
        min_days: int) -> float:
    """타이머 반복 점수 0~1 (v3.3).

    3개 component 가중 평균:
      C1 = 시간대 집중도 (0.4) — 최빈 시작시각 ±1h에 몰리는 비율
      C2 = ON 전환 간격 일정성 (0.3) — 일별 첫 ON 시작시각 std
      C3 = 패턴 일수 비율 (0.3) — ±window 내 반복이 관찰된 일수 비율
    """
    if not all_start_hours or len(daily_stats) < min_days:
        return 0.0

    total_starts = len(all_start_hours)
    if total_starts == 0:
        return 0.0

    hour_counts = Counter(all_start_hours)
    most_common_hour = hour_counts.most_common(1)[0][0]

    # C1: 시간대 집중도 — 최빈 시작시각 ±1h 내 비율
    nearby_count = 0
    for h in all_start_hours:
        diff = abs(h - most_common_hour)
        if diff <= 1 or (24 - diff) <= 1:  # wrap-around
            nearby_count += 1
    concentration = nearby_count / total_starts

    # C2: ON 전환 간격 일정성 — 일별 첫 ON 시작시각의 표준편차
    first_hours = []
    for item in daily_stats:
        start_hours = item[2]
        if start_hours:
            first_hours.append(start_hours[0])
    if len(first_hours) >= 2:
        std_hours = float(np.std(first_hours))
        regularity = max(0.0, 1.0 - std_hours / 6.0)
    else:
        regularity = 0.0

    # C3: 패턴 일수 비율 — ±window 내 반복이 관찰된 일수 / 전체 일수
    window_hours = max(1, window_minutes // 60)
    days_with_pattern = 0
    total_days = len(daily_stats)
    for item in daily_stats:
        start_hours = item[2]
        for sh in start_hours:
            diff = abs(sh - most_common_hour)
            if diff <= window_hours or (24 - diff) <= window_hours:
                days_with_pattern += 1
                break
    pattern_ratio = days_with_pattern / total_days if total_days > 0 else 0.0

    score = 0.4 * concentration + 0.3 * regularity + 0.3 * pattern_ratio
    return round(score, 3)


def _calc_primary_on_window(start_hours: list[int]) -> str:
    """ON 시작 시각으로부터 주요 가동 시간대 문자열 생성.

    Returns:
        예: "06~12시" 또는 빈 문자열 (고르게 분포 시)
    """
    if not start_hours:
        return ""

    hour_counts = Counter(start_hours)
    total = len(start_hours)

    # 가장 빈번한 시간대 찾기
    most_common_hour = hour_counts.most_common(1)[0][0]

    # ±2시간 범위의 집중도 확인
    nearby_count = 0
    nearby_hours = []
    for h in range(most_common_hour - 2, most_common_hour + 3):
        norm_h = h % 24
        nearby_count += hour_counts.get(norm_h, 0)
        if hour_counts.get(norm_h, 0) > 0:
            nearby_hours.append(norm_h)

    # 30% 이상 집중되면 시간대 표시
    if total > 0 and nearby_count / total >= 0.3 and nearby_hours:
        h_start = min(nearby_hours)
        h_end = (max(nearby_hours) + 1) % 24  # +1 = 해당 시간 종료
        if h_end == 0:
            h_end = 24
        return f"{h_start:02d}~{h_end:02d}시"

    return ""


def _calculate_post_casing_baseline(
        pump_id: str, casing_date: str, settings: dict) -> dict | None:
    """케이싱 교체 후 기준선 산출 (v3.5).

    교체일부터 post_casing_baseline_days(60일) 데이터에서
    상위 10% 평균 산출. 최소 post_casing_min_days(30일) 필요.
    반환: {"value", "sample_total", "top_n", "period_days"} 또는 None.
    """
    pc_days = settings.get("post_casing_baseline_days", 60)
    min_days = settings.get("post_casing_min_days", 30)
    top_percent = settings.get("baseline_top_percent", 0.1)

    end_date = (datetime.strptime(casing_date, "%Y-%m-%d")
                + timedelta(days=pc_days)).strftime("%Y-%m-%d")
    daily = get_daily_averages(pump_id, casing_date, end_date)

    valid = [d["avg_flow"] for d in daily
             if d.get("avg_flow") and d["avg_flow"] > 0]

    if len(valid) < min_days:
        return None

    valid.sort(reverse=True)
    top_n = max(3, int(len(valid) * top_percent))

    return {
        "value": round(float(np.mean(valid[:top_n])), 2),
        "sample_total": len(valid),
        "top_n": top_n,
        "period_days": pc_days,
    }


def _calculate_replacement_forecast(
        daily_avgs: list[dict], baseline_value: float,
        settings: dict) -> dict | None:
    """교체 시점 예측 (v3.5.1).

    최근 forecast_window_days(180일) 일평균 유량으로 열화율 시계열 생성 후
    선형회귀(least squares)로 기울기 산출 → 월간 하락률 → 임계값 도달 예측.

    반환: {"monthly_drop_rate", "predicted_months_left",
           "confidence", "data_days", "current_deg_pct"} 또는 None.
    """
    window = settings.get("forecast_window_days", 180)
    min_days = settings.get("forecast_min_days", 90)
    threshold = settings.get("forecast_threshold_pct", -20.0)

    if not daily_avgs or baseline_value is None or baseline_value <= 0:
        return None

    recent = _date_range_slice(daily_avgs, window)
    valid = [(i, d["avg_flow"]) for i, d in enumerate(recent)
             if d.get("avg_flow") and d["avg_flow"] > 0]

    if len(valid) < min_days:
        return None

    # 열화율 시계열: (day_index, deg_pct)
    x = np.array([v[0] for v in valid], dtype=float)
    y = np.array([((v[1] - baseline_value) / baseline_value) * 100
                  for v in valid])

    # 선형회귀 (least squares)
    n = len(x)
    x_mean = np.mean(x)
    y_mean = np.mean(y)
    ss_xx = np.sum((x - x_mean) ** 2)
    ss_xy = np.sum((x - x_mean) * (y - y_mean))

    if ss_xx == 0:
        return None

    slope = ss_xy / ss_xx  # %/day
    intercept = y_mean - slope * x_mean

    # R² 계산
    y_pred = slope * x + intercept
    ss_res = np.sum((y - y_pred) ** 2)
    ss_tot = np.sum((y - y_mean) ** 2)
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

    # 기울기 >= 0: 개선 추세 → 예측 불필요
    if slope >= 0:
        return None

    # 월간 하락률 (%/month)
    monthly_drop = slope * 30.0

    # 현재 열화율 (최근 시점의 회귀 추정값)
    current_deg = slope * x[-1] + intercept

    # threshold 도달까지 남은 일수
    # threshold = slope * (x[-1] + days_left) + intercept
    # days_left = (threshold - current_deg) / slope
    if current_deg <= threshold:
        months_left = 0.0
    else:
        days_left = (threshold - current_deg) / slope
        months_left = days_left / 30.0

    return {
        "monthly_drop_rate": round(monthly_drop, 2),
        "predicted_months_left": round(max(0, months_left), 1),
        "confidence": round(max(0, r_squared) * 100, 1),
        "data_days": n,
        "current_deg_pct": round(current_deg, 1),
        "threshold_pct": threshold,
    }


def _handle_casing_baseline(pump_id: str, settings: dict):
    """케이싱 교체 후 기준선 처리 (v3.5: dual baseline).

    최신 케이싱 이벤트를 기준으로:
    1) baselines 테이블에 7일 평균 저장 (기존)
    2) post_casing_baseline 자동 산출 (60일 상위 10%)
    3) 최신 이벤트보다 이전 이벤트의 post_casing_baseline 무효화
    """
    casings = get_casing_history(pump_id)
    baseline = get_latest_baseline(pump_id)

    for ev in casings:
        if not ev.get("reset_baseline"):
            continue

        change_date = ev["change_date"]

        # (기존) baselines 테이블에 저장 — 7일 평균
        if baseline and baseline["set_date"] >= change_date:
            pass  # 이미 설정됨
        else:
            end_date = (datetime.strptime(change_date, "%Y-%m-%d")
                        + timedelta(days=settings["baseline_days"])
                        ).strftime("%Y-%m-%d")
            daily = get_daily_averages(pump_id, change_date, end_date)
            if daily:
                bl_val = np.mean([d["avg_flow"] for d in daily])
                set_baseline(pump_id, round(bl_val, 2), change_date,
                             f"casing_reset_{ev['id']}")
                logger.info(f"펌프 {pump_id}: 케이싱 교체({change_date}) 후 "
                            f"기준선 재설정 = {bl_val:.2f}")

        # (v3.5) 이전 이벤트의 stale baseline 무효화
        invalidate_old_casing_baselines(pump_id, change_date)

        # (v3.5) post_casing_baseline 자동 산출
        if not ev.get("post_casing_baseline"):
            pc_bl = _calculate_post_casing_baseline(
                pump_id, change_date, settings)
            if pc_bl:
                update_casing_baseline(
                    ev["id"], pc_bl["value"],
                    datetime.now().strftime("%Y-%m-%d"))
                logger.info(
                    f"펌프 {pump_id}: 교체 후 기준선 산출 = {pc_bl['value']:.2f} "
                    f"({pc_bl['sample_total']}개 중 상위 {pc_bl['top_n']}개)")

        break  # 가장 최근 건만 처리


def _make_judgment(result: dict, settings: dict) -> tuple[str, str]:
    """종합 판정 + 상세설명. 우선순위 + 보조가중 + 역할 인식 (v3.1)."""
    reasons = []

    eff_s = result.get('effective_start', '')
    eff_e = result.get('effective_end', '')
    eff_d = result.get('effective_days', 0)
    exp_r = result.get('expected_records', 0)
    dr = result.get('data_rate')
    valid_info = (
        f"분석기간(effective): {eff_s}~{eff_e} ({eff_d}일, 기대 {exp_r:,}건), "
        f"유효 {result.get('valid_records',0):,}건/{result.get('total_records',0):,}건"
    )

    deg = result.get("degradation_pct")
    bl = result.get("baseline_value")
    tm = result.get("timer_mode", "")
    cycle_exceeded = result.get("cycle_exceeded", 0)

    # v3.1: 역할별 임계값 선택
    op_type = result.get("operation_type", "main")
    use_relaxed = op_type in ("timer", "assist")

    if use_relaxed:
        sev = settings.get("degradation_severe_relaxed", -25.0)
        warn = settings.get("degradation_warning_relaxed", -12.0)
        watch = settings.get("degradation_watch_relaxed", -7.0)
        threshold_label = f"완화 임계값(역할={op_type})"
    else:
        sev = settings["degradation_severe"]
        warn = settings["degradation_warning"]
        watch = settings["degradation_watch"]
        threshold_label = "표준 임계값"

    # ── Step 0: 기준선 없음 판정 (v3.1) ────────────────────
    if bl is None or result.get("baseline_source") == "none":
        primary = "기준 없음"
        reasons.append(
            "비교 기준선이 설정되지 않아 정량 판정 불가. "
            "rated_flow 또는 충분한 운전 이력이 확보되면 재분석하세요."
        )
        # v3.2: 기준없음이지만 가동시간 기준은 있을 수 있음
        on_deg_s0 = result.get("on_time_degradation_pct")
        if on_deg_s0 is not None:
            on_sev_s0 = settings.get("on_time_degradation_severe", -30.0)
            on_warn_s0 = settings.get("on_time_degradation_warning", -15.0)
            if on_deg_s0 <= on_sev_s0:
                primary = "점검권장"
                reasons.append(
                    f"가동시간 감소 {on_deg_s0:.1f}%로 심각 수준. "
                    "유량 기준선은 없으나 가동시간 이상으로 점검 권장.")
            elif on_deg_s0 <= on_warn_s0:
                primary = "경과관찰"
                reasons.append(
                    f"가동시간 감소 {on_deg_s0:.1f}%로 주의 수준. "
                    "유량 기준선 없음 — 가동시간 추이 모니터링 필요.")
        # 보조 라벨만 추가
        sub_labels = []
        if op_type != "main":
            sub_labels.append(f"역할:{op_type}")
        if tm and tm != "상시가동":
            sub_labels.append(f"타이머운전({tm})")
        if cycle_exceeded:
            days = result.get("days_since_last_casing")
            sub_labels.append("주기점검 필요")
            reasons.append(
                f"마지막 교체/설치 후 {days}일 경과로 목표 점검주기를 초과했습니다."
            )
        if on_deg_s0 is not None and on_deg_s0 <= settings.get(
                "on_time_degradation_watch", -8.0):
            sub_labels.append("가동시간 감소")
        reasons.append(valid_info)
        parts = [primary] + sub_labels
        return " / ".join(parts), " ".join(reasons)

    # ── Step 1: 우선순위 판정 (첫 매칭이 주 판정) ──────────
    primary = "정상"

    if deg is not None and deg <= sev:
        primary = "정밀점검 필요"
        reasons.append(
            f"기준선 대비 변화 {deg:.1f}%로 심각 수준"
            f"(기준 {sev}% 이하, {threshold_label}). "
            f"기준선 {bl:.2f} 대비 현재 평균 {result.get('avg_flow',0):.2f}. "
            "펌프 성능 저하 또는 케이싱 손상 가능성이 있으므로 정밀점검을 시행하세요."
        )
    elif deg is not None and deg <= warn:
        primary = "점검권장"
        reasons.append(
            f"기준선 대비 변화 {deg:.1f}%로 주의 수준"
            f"(기준 {warn}% 이하, {threshold_label}). "
            f"기준선 {bl:.2f} 대비 현재 평균 {result.get('avg_flow',0):.2f}. "
            "추가 저하 방지를 위해 점검을 권장합니다."
        )
    elif deg is not None and deg <= watch:
        primary = "경과관찰"
        reasons.append(
            f"기준선 대비 변화 {deg:.1f}%로 관찰 수준"
            f"(기준 {watch}% 이하, {threshold_label}). "
            f"기준선 {bl:.2f} 대비 현재 평균 {result.get('avg_flow',0):.2f}. "
            "당장 조치는 불필요하나 추이를 지속 모니터링하세요."
        )
    elif tm == "타이머(반복)":
        primary = "점검권장"
        reasons.append("타이머 반복 패턴이 지속 감지되어 점검을 권장합니다.")
    elif cycle_exceeded:
        primary = "점검권장"
        days = result.get("days_since_last_casing")
        reasons.append(
            f"마지막 교체/설치 후 {days}일 경과로 목표 점검주기를 초과했습니다."
        )
    elif result.get("micro_cycle_detected"):
        primary = "점검권장"
        mc = result.get("micro_cycle_count", 0)
        reasons.append(
            f"상시가동 중 짧은 OFF 이벤트 {mc}회 감지(micro-cycle). "
            "전원/베어링/차단기 문제 가능성. 점검 권장."
        )
    else:
        if deg is not None:
            reasons.append(
                f"기준선 대비 변화 {deg:.1f}%로 정상 범위. "
                f"기준선 {bl:.2f} 대비 현재 평균 {result.get('avg_flow',0):.2f}."
            )
        else:
            reasons.append(
                "하락률 산출 불가 (유효 데이터 부족 또는 기준선 0)."
            )

    # ── Step 2: 보조 가중 (복합 위험요소 승격, 3축+v3.3) ────
    risk_flags = 0.0
    flow_weight = result.get("flow_risk_weight", 1.0)
    if deg is not None and deg <= sev:
        risk_flags += flow_weight  # v3.3: timer=0.7, main=1.0
    if tm == "타이머(반복)":
        risk_flags += 1
    if cycle_exceeded:
        risk_flags += 1
    if result.get("micro_cycle_detected"):
        risk_flags += 1  # v3.3: micro-cycle도 risk 축에 추가

    # v3.2: 가동시간 감소 축
    on_deg = result.get("on_time_degradation_pct")
    on_sev = settings.get("on_time_degradation_severe", -30.0)
    on_warn = settings.get("on_time_degradation_warning", -15.0)
    on_watch = settings.get("on_time_degradation_watch", -8.0)

    if on_deg is not None and on_deg <= on_sev:
        risk_flags += 1
        reasons.append(
            f"가동시간 감소 {on_deg:.1f}%로 심각 수준"
            f"(기준 {on_sev}% 이하)."
        )
    elif on_deg is not None and on_deg <= on_warn:
        risk_flags += 1
        reasons.append(
            f"가동시간 감소 {on_deg:.1f}%로 주의 수준"
            f"(기준 {on_warn}% 이하)."
        )

    if risk_flags >= 2.0 and primary != "정밀점검 필요":
        primary = "정밀점검 필요"
        reasons.append(
            f"복합 위험요소 {risk_flags:.1f}점 중첩으로 판정 상향."
        )

    # ── Step 3: 보조 라벨 (정보 추가) ─────────────────────
    sub_labels = []

    # v3.1: 역할 라벨
    if op_type != "main":
        sub_labels.append(f"역할:{op_type}")

    if dr is not None:
        if dr < 70:
            sub_labels.append("데이터 경고")
            reasons.append(
                f"데이터 확보율 {dr:.1f}%로 경고 수준(50~70%). "
                "누락 구간이 많아 분석 정확도가 낮을 수 있습니다."
            )
        elif dr < 90:
            sub_labels.append("데이터 주의")
            reasons.append(
                f"데이터 확보율 {dr:.1f}%로 주의 수준(70~90%). "
                "일부 누락 구간이 있으나 분석은 유효합니다."
            )

    if tm and tm != "상시가동":
        on_min = result.get("avg_on_minutes_per_day")
        on_evt = result.get("avg_on_events_per_day")
        window = result.get("primary_on_window", "")
        detail = f"가동 패턴: {tm}"
        if on_min is not None:
            detail += f", 일평균 가동 {on_min:.0f}분"
        if on_evt is not None:
            detail += f", 일평균 {on_evt:.1f}회"
        if window:
            detail += f", 주요 가동시간대 {window}"
        sub_labels.append(f"타이머운전({tm})")
        reasons.append(detail + ".")

    if cycle_exceeded and not any("주기" in r for r in reasons):
        days = result.get("days_since_last_casing")
        sub_labels.append("주기점검 필요")
        reasons.append(
            f"마지막 교체/설치 후 {days}일 경과로 목표 점검주기를 초과했습니다."
        )

    # v3.2: 가동시간 감소 보조 라벨
    if on_deg is not None and on_deg <= on_watch:
        if not any("가동시간" in r for r in reasons):
            on_bl = result.get("on_time_baseline")
            cur_on = result.get("daily_avg_on_minutes") or 0
            reasons.append(
                f"가동시간 감소 {on_deg:.1f}% "
                f"(기준 {on_bl:.0f}분/일 대비 현재 {cur_on:.0f}분/일)."
            )
        sub_labels.append("가동시간 감소")

    reasons.append(valid_info)

    parts = [primary] + sub_labels
    return " / ".join(parts), " ".join(reasons)


# ── v4.3: 백테스트 엔진 ────────────────────────────────────────
def run_backtest(pump_id: str, settings: dict = None) -> dict:
    """단일 펌프 백테스트: 과거 데이터를 날짜별로 순회하며 분류 재현.

    실제 리셋 이벤트(케이싱/펌프교체)와 비교하여 정확도 산출.

    Returns:
        {
          "pump_id": str,
          "total_days": int,         # 탐색한 날짜 수
          "alert_days": int,         # '즉시점검' 발생 일수
          "reset_events": int,       # 실제 리셋 이벤트 수
          "true_positives": int,     # 이벤트 전 30일 내 경고 발생
          "false_positives": int,    # 경고 발생했으나 30일 내 이벤트 없음
          "false_negatives": int,    # 이벤트 있으나 30일 내 경고 없음
          "오탐률": float,           # FP / (TP + FP)
          "미탐률": float,           # FN / (FN + TP)
          "avg_early_warning_days": float | None,  # 평균 조기 경고 일수
          "daily_log": list[dict],   # [{date, category}] 전체 로그
        }
    """
    if settings is None:
        settings = load_settings()

    daily_avgs = get_daily_averages(pump_id)
    casings = get_casing_history(pump_id)

    # 리셋 이벤트만 필터 (casing/pump_replacement)
    reset_events = [
        c for c in casings
        if c.get("event_type", "casing") in ("casing", "pump_replacement")
    ]
    reset_dates = sorted(set(c["change_date"] for c in reset_events))

    if not daily_avgs:
        return {
            "pump_id": pump_id, "total_days": 0, "alert_days": 0,
            "reset_events": len(reset_dates),
            "true_positives": 0, "false_positives": 0, "false_negatives": 0,
            "오탐률": 0.0, "미탐률": 0.0,
            "avg_early_warning_days": None, "daily_log": [],
        }

    all_dates = sorted(set(d["date"] for d in daily_avgs))
    daily_avgs_sorted = sorted(daily_avgs, key=lambda d: d["date"])

    # 날짜 인덱스 빌드
    date_to_idx = {}
    for i, d in enumerate(daily_avgs_sorted):
        date_to_idx[d["date"]] = i

    # 사이클 경계 결정: 리셋 이벤트 날짜들
    # 각 날짜에 대해 '해당 사이클 시작일' 찾기
    def _cycle_start_for(target_date: str) -> str:
        """target_date 이전의 가장 최근 리셋 이벤트 날짜. 없으면 빈 문자열."""
        cs = ""
        for rd in reset_dates:
            if rd <= target_date:
                cs = rd
            else:
                break
        return cs

    # 기준선 캐시 (사이클별)
    _baseline_cache: dict[str, float | None] = {}

    def _get_cycle_baseline(cycle_start: str, slice_up_to: list[dict]) -> float | None:
        """사이클 시작부터의 데이터로 auto baseline 산출 (캐시 활용)."""
        # 캐시 키: cycle_start + 데이터 일수 (10일 단위로 캐시)
        n_days = len(slice_up_to)
        cache_key = f"{cycle_start}_{n_days // 10}"
        if cache_key in _baseline_cache:
            return _baseline_cache[cache_key]
        bl_info = calculate_auto_baseline(slice_up_to, settings)
        val = bl_info["value"] if bl_info else None
        _baseline_cache[cache_key] = val
        return val

    # 분류를 위한 최소 데이터 요구: 14일 (rolling 계산에 필요)
    min_days_for_classify = 14

    daily_log = []
    rolling_thr = settings.get("rolling_7d_drop_threshold", -5.0)

    for target_date in all_dates:
        cycle_start = _cycle_start_for(target_date)

        # 사이클 시작 이후 데이터만 슬라이스
        if cycle_start:
            cycle_slice = [d for d in daily_avgs_sorted
                           if cycle_start <= d["date"] <= target_date]
        else:
            cycle_slice = [d for d in daily_avgs_sorted
                           if d["date"] <= target_date]

        n_valid = len(cycle_slice)
        if n_valid < min_days_for_classify:
            daily_log.append({"date": target_date, "category": "정상"})
            continue

        # 기준선 산출
        baseline = _get_cycle_baseline(cycle_start, cycle_slice)

        # 하락률 산출
        deg_pct = None
        if baseline and baseline > 0:
            recent_days = _date_range_slice(cycle_slice,
                                            settings.get("baseline_days", 7))
            if recent_days:
                recent_avg = sum(d["avg_flow"] for d in recent_days
                                 if d.get("avg_flow") and d["avg_flow"] > 0)
                recent_cnt = sum(1 for d in recent_days
                                 if d.get("avg_flow") and d["avg_flow"] > 0)
                if recent_cnt > 0:
                    recent_avg /= recent_cnt
                    deg_pct = round(
                        ((recent_avg - baseline) / baseline) * 100, 1)

        # rolling 지표 산출
        rolling_drop = _calculate_rolling_7d_drop(cycle_slice)
        rolling_streak = _calculate_rolling_drop_streak(cycle_slice, rolling_thr)

        # 모의 result dict 구성 (분류에 필요한 최소 필드)
        mock_result = {
            "judgment": "정상",  # 데이터 있으면 일단 정상으로 시작
            "degradation_pct": deg_pct,
            "rolling_7d_drop_pct": rolling_drop,
            "rolling_drop_streak": rolling_streak,
            "valid_data_days": n_valid,
            "replacement_forecast": None,  # 백테스트에서 forecast는 생략
            "baseline_confidence": 100,  # 백테스트에서 기준선 신뢰도는 기본 100
            "recent_coverage": 100.0,
        }

        cat, rsn = classify_action_with_reason(mock_result, settings)
        daily_log.append({
            "date": target_date, "category": cat, "reason": rsn})

    # ── 정확도 산출 ─────────────────────────────────────────
    alert_dates = set(
        entry["date"] for entry in daily_log
        if entry["category"] == "즉시점검"
    )

    # TP: 리셋 이벤트 전 30일 내에 '즉시점검' 경고가 있었는가?
    tp_events = []  # (reset_date, first_alert_date, early_days)
    fn_events = []  # 경고 없이 발생한 리셋

    for rd in reset_dates:
        rd_dt = datetime.strptime(rd, "%Y-%m-%d")
        window_start = (rd_dt - timedelta(days=30)).strftime("%Y-%m-%d")
        alerts_in_window = sorted(
            d for d in alert_dates if window_start <= d < rd
        )
        if alerts_in_window:
            first_alert = alerts_in_window[0]
            early_days = (rd_dt - datetime.strptime(first_alert, "%Y-%m-%d")).days
            tp_events.append({
                "reset_date": rd, "first_alert": first_alert,
                "early_days": early_days,
            })
        else:
            fn_events.append({"reset_date": rd})

    # FP: '즉시점검' 경고가 발생했으나 30일 내 리셋이 없는 날
    # 연속 경고는 하나의 FP 에피소드로 카운트 + v4.4: 에피소드 길이 추적
    fp_episode_list = []  # [{start, end, length, reason}]
    _fp_start = None
    _fp_len = 0
    _fp_reason = "none"
    for entry in daily_log:
        if entry["category"] == "즉시점검":
            d = entry["date"]
            d_dt = datetime.strptime(d, "%Y-%m-%d")
            window_end = (d_dt + timedelta(days=30)).strftime("%Y-%m-%d")
            has_reset = any(d < rd <= window_end for rd in reset_dates)
            if not has_reset:
                if _fp_start is None:
                    _fp_start = d
                    _fp_reason = entry.get("reason", "none")
                _fp_len += 1
            else:
                if _fp_start is not None:
                    fp_episode_list.append({
                        "start": _fp_start, "end": entry["date"],
                        "length": _fp_len, "reason": _fp_reason})
                    _fp_start = None
                    _fp_len = 0
        else:
            if _fp_start is not None:
                fp_episode_list.append({
                    "start": _fp_start, "end": entry["date"],
                    "length": _fp_len, "reason": _fp_reason})
                _fp_start = None
                _fp_len = 0
    if _fp_start is not None:
        fp_episode_list.append({
            "start": _fp_start, "end": daily_log[-1]["date"],
            "length": _fp_len, "reason": _fp_reason})

    # v4.4: reason별 TP/FP 카운트
    reason_stats = {}  # reason -> {tp, fp, fn}
    for tp_e in tp_events:
        # TP 이벤트의 reason: 경고 시작일의 reason
        alert_d = tp_e["first_alert"]
        rsn = next((e.get("reason", "none") for e in daily_log
                     if e["date"] == alert_d
                     and e["category"] == "즉시점검"), "none")
        tp_e["reason"] = rsn
        reason_stats.setdefault(rsn, {"tp": 0, "fp": 0, "fn": 0})
        reason_stats[rsn]["tp"] += 1

    for ep in fp_episode_list:
        rsn = ep.get("reason", "none")
        reason_stats.setdefault(rsn, {"tp": 0, "fp": 0, "fn": 0})
        reason_stats[rsn]["fp"] += 1

    # FN은 reason 없음 (경고가 없었으므로)
    for fn_e in fn_events:
        reason_stats.setdefault("none", {"tp": 0, "fp": 0, "fn": 0})
        reason_stats["none"]["fn"] += 1

    # v4.4: 조기경고 분포 (0~7, 7~14, 14~30)
    early_dist = {"0_7": 0, "7_14": 0, "14_30": 0}
    for tp_e in tp_events:
        d = tp_e["early_days"]
        if d <= 7:
            early_dist["0_7"] += 1
        elif d <= 14:
            early_dist["7_14"] += 1
        else:
            early_dist["14_30"] += 1

    tp = len(tp_events)
    fn = len(fn_events)
    fp = len(fp_episode_list)

    오탐률 = round(fp / (tp + fp) * 100, 1) if (tp + fp) > 0 else 0.0
    미탐률 = round(fn / (fn + tp) * 100, 1) if (fn + tp) > 0 else 0.0
    avg_early = (round(sum(e["early_days"] for e in tp_events) / tp, 1)
                 if tp > 0 else None)

    return {
        "pump_id": pump_id,
        "total_days": len(daily_log),
        "alert_days": len(alert_dates),
        "reset_events": len(reset_dates),
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "오탐률": 오탐률,
        "미탐률": 미탐률,
        "avg_early_warning_days": avg_early,
        "tp_details": tp_events,
        "fn_details": fn_events,
        "fp_episodes": fp_episode_list,
        "reason_stats": reason_stats,
        "early_warning_dist": early_dist,
        "daily_log": daily_log,
    }


def run_backtest_all(settings: dict = None) -> dict:
    """전체 펌프 백테스트 실행 + 종합 통계.

    Returns:
        {
          "per_pump": [run_backtest(pump_id) for each pump],
          "summary": {
            "total_reset_events", "total_tp", "total_fp", "total_fn",
            "오탐률", "미탐률", "avg_early_warning_days",
          }
        }
    """
    if settings is None:
        settings = load_settings()

    pumps = get_all_pumps()
    per_pump = []
    for p in pumps:
        try:
            bt = run_backtest(p["pump_id"], settings)
            per_pump.append(bt)
        except Exception as e:
            logger.error(f"백테스트 실패 {p['pump_id']}: {e}")
            per_pump.append({
                "pump_id": p["pump_id"], "total_days": 0, "alert_days": 0,
                "reset_events": 0, "true_positives": 0,
                "false_positives": 0, "false_negatives": 0,
                "오탐률": 0.0, "미탐률": 0.0,
                "avg_early_warning_days": None, "daily_log": [],
                "error": str(e),
            })

    # 종합 집계
    total_tp = sum(r["true_positives"] for r in per_pump)
    total_fp = sum(r["false_positives"] for r in per_pump)
    total_fn = sum(r["false_negatives"] for r in per_pump)
    total_resets = sum(r["reset_events"] for r in per_pump)

    sum_early = sum(
        sum(e["early_days"] for e in r.get("tp_details", []))
        for r in per_pump
    )

    오탐률 = (round(total_fp / (total_tp + total_fp) * 100, 1)
             if (total_tp + total_fp) > 0 else 0.0)
    미탐률 = (round(total_fn / (total_fn + total_tp) * 100, 1)
             if (total_fn + total_tp) > 0 else 0.0)
    avg_early = round(sum_early / total_tp, 1) if total_tp > 0 else None

    # v4.4: 종합 reason_stats
    agg_reason = {}
    for r in per_pump:
        for rsn, counts in r.get("reason_stats", {}).items():
            agg_reason.setdefault(rsn, {"tp": 0, "fp": 0, "fn": 0})
            for k in ("tp", "fp", "fn"):
                agg_reason[rsn][k] += counts[k]

    # v4.4: 종합 조기경고 분포
    agg_early_dist = {"0_7": 0, "7_14": 0, "14_30": 0}
    for r in per_pump:
        for k in agg_early_dist:
            agg_early_dist[k] += r.get("early_warning_dist", {}).get(k, 0)

    # v4.4: FP 에피소드 통계
    all_fp_eps = []
    for r in per_pump:
        all_fp_eps.extend(r.get("fp_episodes", []))
    fp_lengths = [ep["length"] for ep in all_fp_eps]
    avg_fp_len = round(sum(fp_lengths) / len(fp_lengths), 1) if fp_lengths else 0
    max_fp_len = max(fp_lengths) if fp_lengths else 0

    return {
        "per_pump": per_pump,
        "summary": {
            "total_pumps": len(pumps),
            "total_reset_events": total_resets,
            "total_tp": total_tp,
            "total_fp": total_fp,
            "total_fn": total_fn,
            "오탐률": 오탐률,
            "미탐률": 미탐률,
            "avg_early_warning_days": avg_early,
            "reason_stats": agg_reason,
            "early_warning_dist": agg_early_dist,
            "avg_fp_episode_length": avg_fp_len,
            "max_fp_episode_length": max_fp_len,
        },
    }
