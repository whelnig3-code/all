"""기간 분할 및 유틸리티 모듈.

제공 기능:
  - 사용자 선택 기간 -> 주간/월간/분기/연간 자동 분할
  - 전기 기간 계산 (비교용)
  - 데이터 보유 기간 조회
  - 전기 대비 상태변화 판정 (동일 pump_id 기준만)

모든 사용자 노출 표기는 날짜 기반. 주차(Wxx) 표기 절대 사용하지 않음.
"""
import logging
from datetime import datetime, timedelta
from calendar import monthrange

from src.database import get_data_date_range, get_record_count_in_range

logger = logging.getLogger(__name__)

# 기간 유형 상수
PERIOD_TYPES = ("weekly", "monthly", "quarterly", "yearly")

# 기간 유형별 한글명
PERIOD_TYPE_KR = {
    "weekly": "주간",
    "monthly": "월간",
    "quarterly": "분기",
    "yearly": "연간",
}

# 기간 유형별 출력 디렉토리 이름 (config에서 가져올 수도 있지만 순환참조 방지)
PERIOD_DIR_NAMES = {
    "weekly": "weekly",
    "monthly": "monthly",
    "quarterly": "quarterly",
    "yearly": "yearly",
}


# ═════════════════════════════════════════════════════════════
#  리포트 유형 결정
# ═════════════════════════════════════════════════════════════
def get_report_types(start: str, end: str) -> list[str]:
    """선택 기간 길이에 따라 생성할 리포트 유형 결정.

    Rules:
        days >= 7:   weekly
        days >= 30:  + monthly
        days >= 90:  + quarterly
        days >= 365: + yearly
    """
    d_start = datetime.strptime(start, "%Y-%m-%d")
    d_end = datetime.strptime(end, "%Y-%m-%d")
    days = (d_end - d_start).days + 1

    types = []
    if days >= 7:
        types.append("weekly")
    if days >= 30:
        types.append("monthly")
    if days >= 90:
        types.append("quarterly")
    if days >= 365:
        types.append("yearly")
    return types


# ═════════════════════════════════════════════════════════════
#  기간 분할
# ═════════════════════════════════════════════════════════════
def build_periods(start: str, end: str,
                  period_type: str) -> list[tuple[str, str]]:
    """주어진 기간을 period_type에 따라 세부 기간으로 분할.

    각 세부 기간은 [start, end] 범위로 클리핑됨.
    """
    d_start = datetime.strptime(start, "%Y-%m-%d")
    d_end = datetime.strptime(end, "%Y-%m-%d")

    if period_type == "weekly":
        return _build_weekly(d_start, d_end)
    elif period_type == "monthly":
        return _build_monthly(d_start, d_end)
    elif period_type == "quarterly":
        return _build_quarterly(d_start, d_end)
    elif period_type == "yearly":
        return _build_yearly(d_start, d_end)
    else:
        raise ValueError(f"Unknown period_type: {period_type}")


def build_periods_with_data(start: str, end: str,
                            period_type: str) -> list[tuple[str, str]]:
    """build_periods()로 기간 분할 후, 실제 데이터가 있는 기간만 반환."""
    periods = build_periods(start, end, period_type)
    return [(s, e) for s, e in periods
            if get_record_count_in_range(s, e) > 0]


def _build_weekly(d_start: datetime, d_end: datetime):
    """월요일~일요일 기준 주간 분할."""
    periods = []
    monday = d_start - timedelta(days=d_start.weekday())
    while monday <= d_end:
        sunday = monday + timedelta(days=6)
        p_start = max(monday, d_start)
        p_end = min(sunday, d_end)
        periods.append((p_start.strftime("%Y-%m-%d"),
                         p_end.strftime("%Y-%m-%d")))
        monday += timedelta(weeks=1)
    return periods


def _build_monthly(d_start: datetime, d_end: datetime):
    """1일~말일 월간 분할."""
    periods = []
    current = d_start.replace(day=1)
    while current <= d_end:
        _, last_day = monthrange(current.year, current.month)
        month_end = current.replace(day=last_day)
        p_start = max(current, d_start)
        p_end = min(month_end, d_end)
        periods.append((p_start.strftime("%Y-%m-%d"),
                         p_end.strftime("%Y-%m-%d")))
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1, day=1)
        else:
            current = current.replace(month=current.month + 1, day=1)
    return periods


def _build_quarterly(d_start: datetime, d_end: datetime):
    """Q1(1-3), Q2(4-6), Q3(7-9), Q4(10-12) 분할."""
    periods = []
    # 현재 분기의 시작월 계산
    q_start_month = ((d_start.month - 1) // 3) * 3 + 1
    current = d_start.replace(month=q_start_month, day=1)

    while current <= d_end:
        q_end_month = current.month + 2
        _, last_day = monthrange(current.year, q_end_month)
        quarter_end = current.replace(month=q_end_month, day=last_day)
        p_start = max(current, d_start)
        p_end = min(quarter_end, d_end)
        periods.append((p_start.strftime("%Y-%m-%d"),
                         p_end.strftime("%Y-%m-%d")))
        if q_end_month >= 12:
            current = current.replace(year=current.year + 1, month=1, day=1)
        else:
            current = current.replace(month=q_end_month + 1, day=1)
    return periods


def _build_yearly(d_start: datetime, d_end: datetime):
    """1/1~12/31 연간 분할."""
    periods = []
    year = d_start.year
    while datetime(year, 1, 1) <= d_end:
        year_start = datetime(year, 1, 1)
        year_end = datetime(year, 12, 31)
        p_start = max(year_start, d_start)
        p_end = min(year_end, d_end)
        periods.append((p_start.strftime("%Y-%m-%d"),
                         p_end.strftime("%Y-%m-%d")))
        year += 1
    return periods


# ═════════════════════════════════════════════════════════════
#  전기 기간 계산
# ═════════════════════════════════════════════════════════════
def prev_period(p_start: str, p_end: str,
                period_type: str) -> tuple[str, str]:
    """현재 기간의 전기(이전) 기간 계산.

    weekly:    -7일
    monthly:   전월
    quarterly: 전분기
    yearly:    전년
    """
    s = datetime.strptime(p_start, "%Y-%m-%d")
    e = datetime.strptime(p_end, "%Y-%m-%d")

    if period_type == "weekly":
        return ((s - timedelta(days=7)).strftime("%Y-%m-%d"),
                (e - timedelta(days=7)).strftime("%Y-%m-%d"))

    elif period_type == "monthly":
        if s.month == 1:
            prev_s = datetime(s.year - 1, 12, 1)
        else:
            prev_s = datetime(s.year, s.month - 1, 1)
        _, last_day = monthrange(prev_s.year, prev_s.month)
        prev_e = prev_s.replace(day=last_day)
        return prev_s.strftime("%Y-%m-%d"), prev_e.strftime("%Y-%m-%d")

    elif period_type == "quarterly":
        if s.month <= 3:
            prev_s = datetime(s.year - 1, s.month + 9, 1)
        else:
            prev_s = datetime(s.year, s.month - 3, 1)
        prev_e_month = prev_s.month + 2
        _, last_day = monthrange(prev_s.year, prev_e_month)
        prev_e = datetime(prev_s.year, prev_e_month, last_day)
        return prev_s.strftime("%Y-%m-%d"), prev_e.strftime("%Y-%m-%d")

    elif period_type == "yearly":
        return (datetime(s.year - 1, 1, 1).strftime("%Y-%m-%d"),
                datetime(s.year - 1, 12, 31).strftime("%Y-%m-%d"))

    else:
        raise ValueError(f"Unknown period_type: {period_type}")


# ═════════════════════════════════════════════════════════════
#  상태 변화 판정 (동일 pump_id 기준만)
# ═════════════════════════════════════════════════════════════
def calc_status_change(this_result: dict,
                       prev_result: dict | None) -> str:
    """전기 대비 상태 변화 판정.

    규칙 (동일 pump_id 기준):
      - 개선: 평균유량 증가 AND 기준선 대비 변화 개선
      - 악화: 평균유량 감소 OR 기준선 대비 변화 악화
      - 안정: 유량/기준선 대비 변화 ±2% 이내
      - 전기 데이터 없음: 비교 불가
    """
    if prev_result is None:
        return "전기 데이터 없음"

    this_flow = this_result.get("avg_flow")
    prev_flow = prev_result.get("avg_flow")
    this_deg = this_result.get("degradation_pct")
    prev_deg = prev_result.get("degradation_pct")

    if prev_flow is None or prev_flow == 0 or this_flow is None:
        return "전기 데이터 없음"

    flow_change_pct = (this_flow - prev_flow) / prev_flow * 100

    if this_deg is not None and prev_deg is not None:
        deg_change = this_deg - prev_deg
        if abs(flow_change_pct) <= 2 and abs(deg_change) <= 2:
            return "안정"
        if flow_change_pct > 0 and deg_change > 0:
            return "개선"
        if flow_change_pct < -2 or deg_change < -2:
            return "악화"
        return "안정"

    if abs(flow_change_pct) <= 2:
        return "안정"
    if flow_change_pct > 2:
        return "개선"
    return "악화"


def compare_periods(this_results: list[dict],
                    prev_results: list[dict] | None,
                    period_type: str) -> list[dict]:
    """금기 vs 전기 비교 데이터 생성. 동일 pump_id 기준만 매칭."""
    prev_map = {r["pump_id"]: r for r in prev_results} if prev_results else {}

    comparisons = []
    for r in this_results:
        pid = r["pump_id"]
        prev = prev_map.get(pid)

        comp = {
            "pump_id": pid,
            "this_avg_flow": r.get("avg_flow"),
            "prev_avg_flow": prev.get("avg_flow") if prev else None,
            "this_data_rate": r.get("data_rate"),
            "prev_data_rate": prev.get("data_rate") if prev else None,
            "this_degradation": r.get("degradation_pct"),
            "prev_degradation": prev.get("degradation_pct") if prev else None,
            "this_valid_records": r.get("valid_records", 0),
            "prev_valid_records": prev.get("valid_records", 0) if prev else None,
            "this_judgment": r.get("judgment", ""),
            "prev_judgment": prev.get("judgment", "") if prev else "",
            "flow_change_rate": None,
            "status_change": "전기 데이터 없음",
        }

        if (comp["this_avg_flow"] is not None
                and comp["prev_avg_flow"] is not None
                and comp["prev_avg_flow"] > 0):
            comp["flow_change_rate"] = round(
                (comp["this_avg_flow"] - comp["prev_avg_flow"])
                / comp["prev_avg_flow"] * 100, 1)

        comp["status_change"] = calc_status_change(r, prev)
        comparisons.append(comp)

    return comparisons


# ═════════════════════════════════════════════════════════════
#  생성 계획 미리보기 (GUI용)
# ═════════════════════════════════════════════════════════════
def generate_report_plan(start: str, end: str) -> dict:
    """리포트 생성 계획 요약 (데이터 기반).

    데이터가 있는 기간만 카운트하여 반환.
    데이터 있는 유형이 0개이면 report_types에서 제외.

    Returns:
        {
            "total_days": int,
            "report_types": list[str],   # 데이터 있는 유형만
            "counts": {"weekly": N, ...},
            "periods": {"weekly": [(s,e), ...], ...},
        }
    """
    d_start = datetime.strptime(start, "%Y-%m-%d")
    d_end = datetime.strptime(end, "%Y-%m-%d")
    total_days = (d_end - d_start).days + 1

    report_types = get_report_types(start, end)
    counts = {}
    periods_map = {}
    active_types = []

    for rt in report_types:
        periods = build_periods_with_data(start, end, rt)
        if periods:  # 데이터 있는 기간이 있을 때만 포함
            counts[rt] = len(periods)
            periods_map[rt] = periods
            active_types.append(rt)

    return {
        "total_days": total_days,
        "report_types": active_types,
        "counts": counts,
        "periods": periods_map,
    }


# ═════════════════════════════════════════════════════════════
#  데이터 존재 기간 조회
# ═════════════════════════════════════════════════════════════
def get_periods_with_data(period_type: str = "weekly") -> list[dict]:
    """DB에 데이터가 존재하는 기간 목록 반환.

    Returns:
        list of {"start": str, "end": str, "label": str, "record_count": int}
    """
    date_range = get_data_date_range()
    if not date_range:
        return []

    min_date_str, max_date_str = date_range
    periods = build_periods(min_date_str, max_date_str, period_type)

    result = []
    for p_start, p_end in periods:
        count = get_record_count_in_range(p_start, p_end)
        if count > 0:
            result.append({
                "start": p_start,
                "end": p_end,
                "label": f"{p_start} ~ {p_end}",
                "record_count": count,
            })
    return result
